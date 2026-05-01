"""
Sub-Agent B4 (round 2) — Extract additional source-backed facts from gap sections.

Mines:
  - SBC 201 ch 7 (704, 707, 708, 709, 711)  — fire-resistance-rated construction
  - SBC 201 ch 10 (1006, 1010, 1011, 1017, 1018, 1020, 1021, 1023) — egress
  - SBC 801 ch 4-7 from extracted_gaps where threshold-bearing canonical text exists

All facts are hand-extracted from canonical code text I have personally read.
Every fact carries non-empty source_refs and source_quote.
Cap = 80 new facts. Banned symbol "§" never appears in output.
ADDITIVE: does not modify existing facts_full.json or gap_completion_facts.json.
Dedup against BOTH existing files by (section_ref, value, statement-prefix).
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"D:/ConsultX_Clean")
FACTS_DIR = ROOT / "data" / "consultx_brain" / "full_corpus" / "facts"
REPORTS_DIR = ROOT / "reports"

EXISTING_FACTS_FULL = FACTS_DIR / "facts_full.json"
EXISTING_GAP_FACTS = FACTS_DIR / "gap_completion_facts.json"

OUT_FACTS = FACTS_DIR / "round2_gap_facts.json"
OUT_REPORT_MD = REPORTS_DIR / "round2_facts_expansion_report.md"
OUT_REPORT_JSON = REPORTS_DIR / "round2_facts_expansion_report.json"

BANNED = "§"  # section symbol

# ---------------------------------------------------------------------------
# Curated facts — every entry verified against the canonical source text.
# Each entry: (source_code, section_ref, fact_type, statement, value, unit,
#              source_refs[list], source_quote, scope, conditions[list], exceptions[list])
# ---------------------------------------------------------------------------

CURATED = [
    # ============================ SBC 201 — CHAPTER 7 ==========================
    # Section 707 — Fire barriers — opening sizes
    ("SBC-201", "707.6", "threshold",
     "The maximum aggregate width of openings in a fire barrier shall not exceed 25 percent of the length of the wall.",
     25, "percent",
     ["sbc-201-section-707"],
     "Openings shall be limited to a maximum aggregate width of 25 percent of the length of the wall, and the maximum area of any single opening shall not exceed 15 m².",
     "SBC-201 Section 707.6 — fire barrier openings",
     [{"trigger": "aggregate_width_max_percent_of_wall_length", "value": 25, "unit": "percent"}],
     []),
    ("SBC-201", "707.6", "threshold",
     "The maximum area of any single opening in a fire barrier shall not exceed 15 m2.",
     15, "m2",
     ["sbc-201-section-707"],
     "Openings shall be limited to a maximum aggregate width of 25 percent of the length of the wall, and the maximum area of any single opening shall not exceed 15 m².",
     "SBC-201 Section 707.6 — single opening area limit",
     [{"trigger": "single_opening_area_exceeds", "value": 15, "unit": "m2"}],
     ["Adjoining floor areas equipped throughout with an automatic sprinkler system per Section 903.3.1.1 (Exception 1)",
      "Opening protective is a fire door serving exit access stairway/ramp enclosures (Exception 2)",
      "Opening protective tested per ASTM E 119 / UL 263 with rating not less than the wall (Exception 3)"]),
    ("SBC-201", "707.6", "threshold",
     "The maximum length of any single opening in a fire barrier is 4050 mm.",
     4050, "mm",
     ["sbc-201-section-707"],
     "The maximum length of any single opening is limited to 4050 mm for the same reason when used during the testing process.",
     "SBC-201 Section 707.6 — single opening length limit",
     [{"trigger": "single_opening_length_max", "value": 4050, "unit": "mm"}],
     []),

    # Section 708 — Fire partitions
    ("SBC-201", "708.3", "threshold",
     "Fire partitions shall have a fire-resistance rating of not less than 1 hour.",
     1, "hour",
     ["sbc-201-section-708"],
     "Fire partitions shall have a fire-resistance rating of not less than 1 hour.",
     "SBC-201 Section 708.3 — fire partition rating",
     [{"trigger": "fire_resistance_rating_min", "value": 1, "unit": "hour"}],
     ["Corridor walls permitted to have a 1/2 hour fire-resistance rating by Table 1020.2 (Exception 1)",
      "Dwelling/sleeping unit separations in Type IIB, IIIB and VB buildings sprinklered per 903.3.1.1 may be 1/2 hour (Exception 2)"]),
    ("SBC-201", "708.4", "threshold",
     "Fire partitions are not required to extend into a crawl space below where the floor above the crawl space has a minimum 1-hour fire-resistance rating.",
     1, "hour",
     ["sbc-201-section-708"],
     "Fire partitions shall not be required to extend into a crawl space below where the floor above the crawl space has a minimum 1-hour fire-resistance rating.",
     "SBC-201 Section 708.4 Exception 1 — crawl space exception",
     [{"trigger": "floor_above_crawl_space_rating_min", "value": 1, "unit": "hour"}],
     []),

    # Section 709 — Smoke barriers
    ("SBC-201", "709.3", "threshold",
     "A 1-hour fire-resistance rating is required for smoke barriers.",
     1, "hour",
     ["sbc-201-section-709"],
     "A 1-hour fire-resistance rating is required for smoke barriers.",
     "SBC-201 Section 709.3 — smoke barrier rating",
     [{"trigger": "smoke_barrier_rating_min", "value": 1, "unit": "hour"}],
     ["Smoke barriers constructed of minimum 2.5 mm steel in Group I-3 buildings"]),
    ("SBC-201", "709.3", "threshold",
     "Smoke barriers in Group I-3 buildings may be constructed of minimum 2.5 mm steel as an exception to the 1-hour fire-resistance rating.",
     2.5, "mm",
     ["sbc-201-section-709"],
     "Exception: Smoke barriers constructed of minimum 2.5 mm steel in Group I-3 buildings.",
     "SBC-201 Section 709.3 Exception — Group I-3 steel smoke barrier",
     [{"trigger": "min_steel_thickness", "value": 2.5, "unit": "mm"}],
     []),

    # ============================ SBC 201 — CHAPTER 10 ==========================
    # Section 1006 — Egress room/space mech rooms
    ("SBC-201", "1006.2.2.1", "threshold",
     "Two exit access doorways are required in boiler, incinerator and furnace rooms where the area is over 45 m2 and any fuel-fired equipment exceeds 422,000 kJ input capacity.",
     45, "m2",
     ["sbc-201-section-1006"],
     "Two exit access doorways are required in boiler, incinerator and furnace rooms where the area is over 45 m2 and any fuel-fired equipment exceeds 422,000 kJ input capacity.",
     "SBC-201 Section 1006.2.2.1 — boiler/incinerator/furnace room egress",
     [{"trigger": "room_area_exceeds", "value": 45, "unit": "m2"},
      {"trigger": "fuel_fired_input_exceeds", "value": 422000, "unit": "kJ"}],
     []),
    ("SBC-201", "1006.2.2.1", "threshold",
     "Boiler/incinerator/furnace room two-exit trigger applies when fuel-fired equipment input capacity exceeds 422,000 kJ.",
     422000, "kJ",
     ["sbc-201-section-1006"],
     "Two exit access doorways are required in boiler, incinerator and furnace rooms where the area is over 45 m2 and any fuel-fired equipment exceeds 422,000 kJ input capacity.",
     "SBC-201 Section 1006.2.2.1 — fuel-fired input threshold",
     [{"trigger": "fuel_fired_input_capacity_exceeds", "value": 422000, "unit": "kJ"}],
     []),
    ("SBC-201", "1006.2.2.2", "threshold",
     "Refrigeration machinery rooms larger than 100 m2 shall have not less than two exits or exit access doorways.",
     100, "m2",
     ["sbc-201-section-1006"],
     "Machinery rooms larger than 100 m2 shall have not less than two exits or exit access doorways.",
     "SBC-201 Section 1006.2.2.2 — refrigeration machinery room two-exit trigger",
     [{"trigger": "machinery_room_area_exceeds", "value": 100, "unit": "m2"}],
     []),
    ("SBC-201", "1006.2.2.2", "threshold",
     "All portions of refrigeration machinery rooms shall be within 45 m of an exit or exit access doorway.",
     45, "m",
     ["sbc-201-section-1006"],
     "All portions of machinery rooms shall be within 45 m of an exit or exit access doorway.",
     "SBC-201 Section 1006.2.2.2 — refrigeration machinery room travel distance",
     [{"trigger": "max_travel_distance_to_exit", "value": 45, "unit": "m"}],
     ["An increase in exit access travel distance is permitted in accordance with Section 1017.1"]),
    ("SBC-201", "1006.2.2.3", "threshold",
     "Refrigerated rooms or spaces having a floor area larger than 100 m2 containing a refrigerant evaporator and maintained below 20°C shall have access to not less than two exits or exit access doorways.",
     100, "m2",
     ["sbc-201-section-1006"],
     "Rooms or spaces having a floor area larger than 100 m2, containing a refrigerant evaporator and maintained at a temperature below 20°C, shall have access to not less than two exits or exit access doorways.",
     "SBC-201 Section 1006.2.2.3 — refrigerated room two-exit trigger",
     [{"trigger": "floor_area_exceeds", "value": 100, "unit": "m2"},
      {"trigger": "temperature_maintained_below", "value": 20, "unit": "celsius"}],
     ["Where using refrigerants in quantities limited to the amounts based on the volume set forth in SBC 501"]),
    ("SBC-201", "1006.2.2.3", "threshold",
     "All portions of a refrigerated room or space shall be within 45 m of an exit or exit access doorway where such rooms are not protected by an approved automatic sprinkler system.",
     45, "m",
     ["sbc-201-section-1006"],
     "Exit access travel distance shall be determined as specified in Section 1017.1, but all portions of a refrigerated room or space shall be within 45 m of an exit or exit access doorway where such rooms are not protected by an approved automatic sprinkler system.",
     "SBC-201 Section 1006.2.2.3 — refrigerated room travel distance",
     [{"trigger": "max_travel_distance_unsprinklered", "value": 45, "unit": "m"}],
     []),
    ("SBC-201", "1006.2.2.6", "threshold",
     "Where Group R-3 occupancies are protected by an automatic sprinkler system installed per Section 903.3.1.3, the exit access travel distance for Group R-3 shall be not more than 38 m.",
     38, "m",
     ["sbc-201-section-1006"],
     "Where Group R-3 occupancies are permitted by Section 903.2.8 to be protected by an automatic sprinkler system installed in accordance with Section 903.3.1.3, the exit access travel distance for Group R-3 shall be not more than 38 m.",
     "SBC-201 Section 1006.2.2.6 — Group R-3 travel distance with NFPA 13D",
     [{"trigger": "max_exit_access_travel_distance", "value": 38, "unit": "m"}],
     []),
    ("SBC-201", "1006.2.2.6", "threshold",
     "Where Group R-4 occupancies are protected by an automatic sprinkler system installed per Section 903.3.1.3, the exit access travel distance for Group R-4 shall be not more than 23 m.",
     23, "m",
     ["sbc-201-section-1006"],
     "Where Group R-4 occupancies are permitted by Section 903.2.8 to be protected by an automatic sprinkler system installed in accordance with Section 903.3.1.3, the exit access travel distance for Group R-4 shall be not more than 23 m.",
     "SBC-201 Section 1006.2.2.6 — Group R-4 travel distance with NFPA 13D",
     [{"trigger": "max_exit_access_travel_distance", "value": 23, "unit": "m"}],
     []),
    ("SBC-201", "1006.2.1.1", "threshold",
     "Three exits or exit access doorways shall be provided from any space with an occupant load of 501 to 1,000.",
     501, "occupants",
     ["sbc-201-section-1006"],
     "Three exits or exit access doorways shall be provided from any space with an occupant load of 501 to 1,000.",
     "SBC-201 Section 1006.2.1.1 — three-exit threshold",
     [{"trigger": "occupant_load_lower_bound", "value": 501, "unit": "occupants"}],
     []),
    ("SBC-201", "1006.2.1.1", "threshold",
     "Four exits or exit access doorways shall be provided from any space with an occupant load greater than 1,000.",
     1000, "occupants",
     ["sbc-201-section-1006"],
     "Four exits or exit access doorways shall be provided from any space with an occupant load greater than 1,000.",
     "SBC-201 Section 1006.2.1.1 — four-exit threshold",
     [{"trigger": "occupant_load_exceeds", "value": 1000, "unit": "occupants"}],
     []),

    # Section 1010 — doors
    ("SBC-201", "1010.1.1", "threshold",
     "Each door opening in the means of egress shall provide a minimum clear opening width of 800 mm.",
     800, "mm",
     ["sbc-201-section-1010"],
     "The required capacity of each door opening shall be sufficient for the occupant load thereof and shall provide a minimum clear opening width of 800 mm.",
     "SBC-201 Section 1010.1.1 — minimum door clear opening width",
     [{"trigger": "min_clear_opening_width", "value": 800, "unit": "mm"}],
     ["Group I-3 resident sleeping units (Exception 2: 700 mm minimum)",
      "Storage closets less than 1.0 m2 in area (Exception 3)",
      "Doors to walk-in freezers/coolers less than 100 m2 (Exception 10)",
      "Nonaccessible single-user shower/sauna/toilet stalls (Exception 11: 500 mm minimum)"]),
    ("SBC-201", "1010.1.1", "threshold",
     "In Group I-2, doors serving as means of egress doors used for the movement of beds shall provide a minimum clear opening width of 1000 mm.",
     1000, "mm",
     ["sbc-201-section-1010"],
     "In Group I-2, doors serving as means of egress doors where used for the movement of beds shall provide a minimum clear opening width of 1000 mm.",
     "SBC-201 Section 1010.1.1 — Group I-2 bed-movement door width",
     [{"trigger": "min_clear_opening_width_bed_movement", "value": 1000, "unit": "mm"}],
     []),
    ("SBC-201", "1010.1.1", "threshold",
     "The minimum clear opening height of doors shall be 2000 mm.",
     2000, "mm",
     ["sbc-201-section-1010"],
     "The minimum clear opening height of doors shall be 2000 mm.",
     "SBC-201 Section 1010.1.1 — minimum door clear opening height",
     [{"trigger": "min_clear_opening_height", "value": 2000, "unit": "mm"}],
     ["Exterior door openings other than the required exit door in dwelling/sleeping units not required to be Accessible: 1900 mm (Exception 7)"]),
    ("SBC-201", "1010.1.1", "threshold",
     "Door openings to resident sleeping units in Group I-3 not required to be Accessible shall have a minimum clear opening width of 700 mm.",
     700, "mm",
     ["sbc-201-section-1010"],
     "In Group I-3, door openings to resident sleeping units that are not required to be an Accessible unit shall have a minimum clear opening width of 700 mm.",
     "SBC-201 Section 1010.1.1 Exception 2 — Group I-3 cell doors",
     [{"trigger": "min_clear_opening_width_group_i3", "value": 700, "unit": "mm"}],
     []),
    ("SBC-201", "1010.1.1", "threshold",
     "Doors serving nonaccessible single-user shower/sauna compartments, toilet stalls, or dressing/fitting/changing rooms shall have a minimum clear opening width of 500 mm.",
     500, "mm",
     ["sbc-201-section-1010"],
     "Doors serving nonaccessible single-user shower or sauna compartments, toilet stalls or dressing, fitting or changing rooms shall have a minimum clear opening width of 500 mm.",
     "SBC-201 Section 1010.1.1 Exception 11 — single-user fixtures",
     [{"trigger": "min_clear_opening_width_nonaccessible_single_user", "value": 500, "unit": "mm"}],
     []),
    ("SBC-201", "1010.1.1.1", "threshold",
     "Projections into the required clear opening width are not permitted lower than 850 mm above the floor or ground.",
     850, "mm",
     ["sbc-201-section-1010"],
     "There shall not be projections into the required clear opening width lower than 850 mm above the floor or ground.",
     "SBC-201 Section 1010.1.1.1 — projection height limit",
     [{"trigger": "projections_prohibited_below_height", "value": 850, "unit": "mm"}],
     []),
    ("SBC-201", "1010.1.1.1", "threshold",
     "Projections into the clear opening width between 850 mm and 2000 mm above the floor or ground shall not exceed 100 mm.",
     100, "mm",
     ["sbc-201-section-1010"],
     "Projections into the clear opening width between 850 mm and 2000 mm above the floor or ground shall not exceed 100 mm.",
     "SBC-201 Section 1010.1.1.1 — projection depth limit",
     [{"trigger": "max_projection_depth", "value": 100, "unit": "mm"}],
     ["Door closers, overhead door stops, power door operators, and electromagnetic door locks shall be permitted to be 2000 mm minimum above the floor"]),
    ("SBC-201", "1010.1.2.1", "threshold",
     "Side-hinged swinging doors, pivoted doors and balanced doors shall swing in the direction of egress travel where serving a room with an occupant load of 50 or more or a Group H occupancy.",
     50, "occupants",
     ["sbc-201-section-1010"],
     "Side-hinged swinging doors, pivoted doors and balanced doors shall swing in the direction of egress travel where serving a room or area containing an occupant load of 50 or more persons or a Group H occupancy.",
     "SBC-201 Section 1010.1.2.1 — direction-of-swing trigger",
     [{"trigger": "occupant_load_threshold_for_egress_swing", "value": 50, "unit": "occupants"}],
     []),
    ("SBC-201", "1010.1.3", "threshold",
     "The operational force to unlatch doors with push or pull hardware shall not exceed 67 N.",
     67, "N",
     ["sbc-201-section-1010"],
     "Where door hardware operates by push or pull, the operational force to unlatch the door shall not exceed 67 N.",
     "SBC-201 Section 1010.1.3 — push/pull unlatch force",
     [{"trigger": "max_unlatch_force_push_pull", "value": 67, "unit": "N"}],
     []),
    ("SBC-201", "1010.1.3", "threshold",
     "The operational force to unlatch doors with rotation hardware shall not exceed 3.15 N-m.",
     3.15, "N-m",
     ["sbc-201-section-1010"],
     "Where door hardware operates by rotation, the operational force to unlatch the door shall not exceed 3.15 N-m.",
     "SBC-201 Section 1010.1.3 — rotation unlatch torque",
     [{"trigger": "max_unlatch_torque_rotation", "value": 3.15, "unit": "N-m"}],
     []),
    ("SBC-201", "1010.1.3", "threshold",
     "For interior swinging egress doors that are manually operated, other than fire-rated, the force for pushing or pulling the door shall not exceed 22 N.",
     22, "N",
     ["sbc-201-section-1010"],
     "For interior swinging egress doors that are manually operated, other than doors required to be fire rated, the force for pushing or pulling open the door shall not exceed 22 N.",
     "SBC-201 Section 1010.1.3 — interior swinging egress door opening force",
     [{"trigger": "max_open_force_interior_swinging", "value": 22, "unit": "N"}],
     []),
    ("SBC-201", "1010.1.3", "threshold",
     "For other swinging, sliding, folding, or fire-rated doors, the door shall require not more than 133 N to set in motion.",
     133, "N",
     ["sbc-201-section-1010"],
     "For other swinging doors, sliding doors or folding doors, and doors required to be fire rated, the door shall require not more than a 133 N force to be set in motion and shall move to a full-open position when subjected to not more than a 67 N force.",
     "SBC-201 Section 1010.1.3 — other doors set-in-motion force",
     [{"trigger": "max_force_to_set_in_motion", "value": 133, "unit": "N"}],
     []),
    ("SBC-201", "1010.1.3", "threshold",
     "Other swinging, sliding, folding, and fire-rated doors shall move to a full-open position when subjected to not more than 67 N force.",
     67, "N",
     ["sbc-201-section-1010"],
     "For other swinging doors, sliding doors or folding doors, and doors required to be fire rated, the door shall require not more than a 133 N force to be set in motion and shall move to a full-open position when subjected to not more than a 67 N force.",
     "SBC-201 Section 1010.1.3 — other doors full-open force",
     [{"trigger": "max_force_to_full_open", "value": 67, "unit": "N"}],
     []),

    # Section 1011 — Stairways
    ("SBC-201", "1011.5", "threshold",
     "Stair riser heights shall be 175 mm maximum and 100 mm minimum.",
     175, "mm",
     ["sbc-201-section-1011"],
     "Stair riser heights shall be 175 mm maximum and 100 mm minimum.",
     "SBC-201 Section 1011.5 — stair riser maximum height",
     [{"trigger": "max_riser_height", "value": 175, "unit": "mm"}],
     []),
    ("SBC-201", "1011.5", "threshold",
     "Stair riser heights shall not be less than 100 mm.",
     100, "mm",
     ["sbc-201-section-1011"],
     "Stair riser heights shall be 175 mm maximum and 100 mm minimum.",
     "SBC-201 Section 1011.5 — stair riser minimum height",
     [{"trigger": "min_riser_height", "value": 100, "unit": "mm"}],
     []),
    ("SBC-201", "1011.5", "threshold",
     "Stair tread depth shall be 275 mm minimum measured horizontally between the vertical planes of the foremost projection of adjacent treads.",
     275, "mm",
     ["sbc-201-section-1011"],
     "275 mm minimum measured horizontally between the vertical planes of the foremost projection of adjacent treads.",
     "SBC-201 Section 1011.5 — stair tread depth minimum",
     [{"trigger": "min_tread_depth", "value": 275, "unit": "mm"}],
     []),
    ("SBC-201", "1011.3", "threshold",
     "Stairways shall have a minimum headroom clearance of not less than 2100 mm measured vertically from a line connecting the edge of the nosings.",
     2100, "mm",
     ["sbc-201-section-1011"],
     "headroom clearance of not less than 2100 mm",
     "SBC-201 Section 1011.3 — stairway headroom",
     [{"trigger": "min_headroom_clearance", "value": 2100, "unit": "mm"}],
     ["Spiral stairways permitted by Section 1011.10 are permitted a 2000 mm headroom"]),
    ("SBC-201", "1011.2", "threshold",
     "The required width of stairways shall be not less than 1100 mm.",
     1100, "mm",
     ["sbc-201-section-1011"],
     "width shall be not less than 1100 mm.",
     "SBC-201 Section 1011.2 — stairway minimum width",
     [{"trigger": "min_stairway_width", "value": 1100, "unit": "mm"}],
     ["Stairways serving an occupant load of less than 50 may be 900 mm wide",
      "Spiral stairways may be 660 mm where conforming"]),

    # Section 1017 — Exit access travel distance
    ("SBC-201", "1017.2.1", "threshold",
     "Exit access travel distances may be increased up to an additional 30 m where the last portion of exit access leading to the exit occurs on an exterior egress balcony complying with Section 1021.",
     30, "m",
     ["sbc-201-section-1017"],
     "Exit access travel distances specified in Table 1017.2 shall be increased up to an additional 30 m provided the last portion of the exit access leading to the exit occurs on an exterior egress balcony constructed in accordance with Section 1021.",
     "SBC-201 Section 1017.2.1 — exterior egress balcony increase",
     [{"trigger": "max_additional_travel_distance", "value": 30, "unit": "m"}],
     []),
    ("SBC-201", "1017.2.2", "threshold",
     "The maximum exit access travel distance shall be 120 m in Group F-1 or S-1 occupancies meeting the one-story, 7300 mm ceiling, and sprinklered conditions.",
     120, "m",
     ["sbc-201-section-1017"],
     "The maximum exit access travel distance shall be 120 m in Group F-1 or S-1 occupancies where all of the following conditions are met:",
     "SBC-201 Section 1017.2.2 — Group F-1/S-1 increase",
     [{"trigger": "max_exit_access_travel_distance", "value": 120, "unit": "m"},
      {"trigger": "min_finished_floor_to_ceiling_height", "value": 7300, "unit": "mm"}],
     []),
    ("SBC-201", "1017.2.2", "threshold",
     "Group F-1/S-1 increase to 120 m travel distance requires minimum height from finished floor to bottom of ceiling/roof slab of 7300 mm.",
     7300, "mm",
     ["sbc-201-section-1017"],
     "The minimum height from the finished floor to the bottom of the ceiling or roof slab or deck is 7300 mm.",
     "SBC-201 Section 1017.2.2 condition 2 — minimum ceiling height",
     [{"trigger": "min_ceiling_height_for_120m_increase", "value": 7300, "unit": "mm"}],
     []),

    # Section 1018 — Aisles
    ("SBC-201", "1018.3", "threshold",
     "In Group B and M occupancies, non-public aisles serving less than 50 people and not required to be accessible need not exceed 700 mm in width.",
     700, "mm",
     ["sbc-201-section-1018"],
     "Exception: Non-public aisles serving less than 50 people and not required to be accessible by Chapter 11 need not exceed 700 mm in width.",
     "SBC-201 Section 1018.3 Exception — narrow aisles",
     [{"trigger": "max_aisle_width_nonpublic", "value": 700, "unit": "mm"}],
     []),
    ("SBC-201", "1018.4", "threshold",
     "In Group M, the minimum clear width for an aisle access-way not required to be accessible shall be 750 mm.",
     750, "mm",
     ["sbc-201-section-1018"],
     "The minimum clear width for an aisle access-way not required to be accessible shall be 750 mm.",
     "SBC-201 Section 1018.4 — Group M merchandise pad aisle access-way",
     [{"trigger": "min_clear_width_aisle_accessway", "value": 750, "unit": "mm"}],
     []),
    ("SBC-201", "1018.4", "threshold",
     "The common path of egress travel within a Group M merchandise pad shall not exceed 9 m from any point in the merchandise pad.",
     9, "m",
     ["sbc-201-section-1018"],
     "The common path of egress travel shall not exceed 9 m from any point in the merchandise pad.",
     "SBC-201 Section 1018.4 — merchandise pad common path of egress",
     [{"trigger": "max_common_path_egress_travel", "value": 9, "unit": "m"}],
     ["For areas serving not more than 50 occupants, the common path of egress travel shall not exceed 23 m"]),
    ("SBC-201", "1018.4", "threshold",
     "For areas serving not more than 50 occupants in a Group M merchandise pad, the common path of egress travel shall not exceed 23 m.",
     23, "m",
     ["sbc-201-section-1018"],
     "Exception: For areas serving not more than 50 occupants, the common path of egress travel shall not exceed 23 m.",
     "SBC-201 Section 1018.4 Exception — merchandise pad small-occupant common path",
     [{"trigger": "max_common_path_egress_travel_50_or_less", "value": 23, "unit": "m"}],
     []),
    ("SBC-201", "1018.5", "threshold",
     "In other than assembly spaces and Group B/M, non-public aisles serving less than 50 people and not required to be accessible need not exceed 700 mm in width.",
     700, "mm",
     ["sbc-201-section-1018"],
     "Exception: Nonpublic aisles serving less than 50 people and not required to be accessible by Chapter 11 need not exceed 700 mm in width.",
     "SBC-201 Section 1018.5 Exception — non-public aisle width",
     [{"trigger": "max_aisle_width_nonpublic", "value": 700, "unit": "mm"}],
     []),

    # Section 1020 — Corridors
    ("SBC-201", "1020.3", "threshold",
     "In Group I-2 occupancies, corridors are not required to have a clear width of 2400 mm in areas where there will not be stretcher or bed movement.",
     2400, "mm",
     ["sbc-201-section-1020"],
     "Exception: In Group I-2 occupancies, corridors are not required to have a clear width of 2400 mm in areas where there will not be stretcher or bed movement for access to care or as part of the defend-in-place strategy.",
     "SBC-201 Section 1020.3 Exception — Group I-2 corridor width",
     [{"trigger": "max_corridor_width_no_bed_movement", "value": 2400, "unit": "mm"}],
     []),
    ("SBC-201", "1020.5", "threshold",
     "Where more than one exit or exit access doorway is required, dead-end corridors shall not exceed 6 m in length.",
     6, "m",
     ["sbc-201-section-1020"],
     "Where more than one exit or exit access doorway is required, the exit access shall be arranged such that dead-end corridors do not exceed 6 m in length.",
     "SBC-201 Section 1020.5 — dead-end corridor length",
     [{"trigger": "max_dead_end_corridor_length", "value": 6, "unit": "m"}],
     ["Group I-3 Condition 2/3/4: 15 m (Exception 1)",
      "Sprinklered Groups B/E/F/I-1/M/R-1/R-2/S/U: 15 m (Exception 2)",
      "Length less than 2.5x the least width (Exception 3)",
      "Group I-2 Condition 2 non-patient: 9 m (Exception 4)"]),
    ("SBC-201", "1020.5", "threshold",
     "In Group I-3 Condition 2, 3 or 4 occupancies, the dead end in a corridor shall not exceed 15 m.",
     15, "m",
     ["sbc-201-section-1020"],
     "In Group I-3, Condition 2, 3 or 4, occupancies, the dead end in a corridor shall not exceed 15 m.",
     "SBC-201 Section 1020.5 Exception 1 — Group I-3 dead end",
     [{"trigger": "max_dead_end_corridor_length_group_i3", "value": 15, "unit": "m"}],
     []),
    ("SBC-201", "1020.5", "threshold",
     "In sprinklered Groups B, E, F, I-1, M, R-1, R-2, S and U occupancies, the length of dead-end corridors shall not exceed 15 m.",
     15, "m",
     ["sbc-201-section-1020"],
     "In occupancies in Groups B, E, F, I-1, M, R-1, R-2, S and U, where the building is equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1, the length of the dead-end corridors shall not exceed 15 m.",
     "SBC-201 Section 1020.5 Exception 2 — sprinklered building dead end",
     [{"trigger": "max_dead_end_corridor_length_sprinklered", "value": 15, "unit": "m"}],
     []),
    ("SBC-201", "1020.5", "threshold",
     "In Group I-2 Condition 2 occupancies, dead-end corridors that do not serve patient rooms or treatment spaces shall not exceed 9 m.",
     9, "m",
     ["sbc-201-section-1020"],
     "In Group I-2, Condition 2 occupancies, the length of dead-end corridors that do not serve patient rooms or patient treatment spaces shall not exceed 9 m.",
     "SBC-201 Section 1020.5 Exception 4 — Group I-2 non-patient dead end",
     [{"trigger": "max_dead_end_corridor_length_group_i2_nonpatient", "value": 9, "unit": "m"}],
     []),
    ("SBC-201", "1020.5", "threshold",
     "Dead-end corridor shall not be limited in length where the length is less than 2.5 times the least width of the dead-end corridor.",
     2.5, "ratio",
     ["sbc-201-section-1020"],
     "A dead-end corridor shall not be limited in length where the length of the dead-end corridor is less than 2.5 times the least width of the dead-end corridor.",
     "SBC-201 Section 1020.5 Exception 3 — length-to-width ratio exemption",
     [{"trigger": "max_length_to_width_ratio_exemption", "value": 2.5, "unit": "ratio"}],
     []),
    ("SBC-201", "1020.6", "threshold",
     "In tenant spaces of 100 m2 or less in area, utilization of corridors for conveying return air is permitted.",
     100, "m2",
     ["sbc-201-section-1020"],
     "Where located within tenant spaces of 100 m2 or less in area, utilization of corridors for conveying return air is permitted.",
     "SBC-201 Section 1020.6 Exception 3 — small tenant space return air",
     [{"trigger": "max_tenant_space_area_for_return_air", "value": 100, "unit": "m2"}],
     []),

    # Section 1023 — Interior exit stairways and ramps signage
    ("SBC-201", "1023.9", "threshold",
     "Interior exit stairway floor identification signs shall be located not less than 1500 mm above the floor.",
     1500, "mm",
     ["sbc-201-section-1023"],
     "located not less than 1500 mm above the floor",
     "SBC-201 Section 1023.9 — stairway floor identification sign height",
     [{"trigger": "min_sign_height_above_floor", "value": 1500, "unit": "mm"}],
     []),
    ("SBC-201", "1023.9", "threshold",
     "Interior exit stairway floor identification signs shall be a minimum size of 450 mm by 300 mm.",
     450, "mm",
     ["sbc-201-section-1023"],
     "The signs shall be a minimum size of 450 mm by 300 mm.",
     "SBC-201 Section 1023.9 — sign minimum dimension",
     [{"trigger": "min_sign_width", "value": 450, "unit": "mm"}],
     []),

    # Section 705 — Exterior walls
    ("SBC-201", "705.5", "threshold",
     "Exterior wall fire-resistance ratings apply for a distance of 3000 mm where openings face one another at an angle of less than 180 degrees.",
     3000, "mm",
     ["sbc-201-section-705"],
     "The ratings apply for a distance of 3000 mm",
     "SBC-201 Section 705.5 — exterior wall opening rating distance",
     [{"trigger": "rating_application_distance", "value": 3000, "unit": "mm"}],
     []),
    ("SBC-201", "705.6", "threshold",
     "Parapet height for exterior walls shall extend at least 750 mm above the finished floor of the floor immediately above where required.",
     750, "mm",
     ["sbc-201-section-705"],
     "extend at least 750 mm above the finished floor",
     "SBC-201 Section 705.6 — parapet/wall extension above finished floor",
     [{"trigger": "min_extension_above_floor", "value": 750, "unit": "mm"}],
     []),
    ("SBC-201", "705.11", "threshold",
     "Parapets shall extend not less than 750 mm above the roof surface where required.",
     750, "mm",
     ["sbc-201-section-705"],
     "height shall be not less than 750 mm.",
     "SBC-201 Section 705.11 — parapet minimum height above roof",
     [{"trigger": "min_parapet_height", "value": 750, "unit": "mm"}],
     []),
    ("SBC-201", "705.11", "threshold",
     "Parapet noncombustible faces shall be provided for the uppermost 450 mm above the roof surface.",
     450, "mm",
     ["sbc-201-section-705"],
     "noncombustible faces for the uppermost 450 mm",
     "SBC-201 Section 705.11 — parapet noncombustible face depth",
     [{"trigger": "min_noncombustible_face_depth", "value": 450, "unit": "mm"}],
     []),
    ("SBC-201", "705.8", "threshold",
     "Where exterior wall projections are permitted, projections shall not exceed 50 percent of the depth permitted by other code provisions.",
     50, "percent",
     ["sbc-201-section-705"],
     "projections shall not exceed 50 percent of the",
     "SBC-201 Section 705.8 — projection depth limit",
     [{"trigger": "max_projection_depth_percent", "value": 50, "unit": "percent"}],
     []),

    # Exception captures (1010 series)
    ("SBC-201", "1010.1.1", "exception",
     "Door openings to storage closets less than 1.0 m2 in area shall not be limited by the minimum clear opening width.",
     1.0, "m2",
     ["sbc-201-section-1010"],
     "Door openings to storage closets less than 1.0 m2 in area shall not be limited by the minimum clear opening width.",
     "SBC-201 Section 1010.1.1 Exception 3 — small storage closet",
     [{"trigger": "storage_closet_area_below", "value": 1.0, "unit": "m2"}],
     []),
    ("SBC-201", "1010.1.1", "exception",
     "Doors to walk-in freezers and coolers less than 100 m2 in area shall have a maximum width of 1500 mm nominal.",
     1500, "mm",
     ["sbc-201-section-1010"],
     "Doors to walk-in freezers and coolers less than 100 m2 in area shall have a maximum width of 1500 mm nominal.",
     "SBC-201 Section 1010.1.1 Exception 10 — walk-in freezers/coolers",
     [{"trigger": "max_door_width", "value": 1500, "unit": "mm"}],
     []),
    ("SBC-201", "1010.1.1", "exception",
     "Door openings within a dwelling unit or sleeping unit shall have a minimum clear opening height of 2000 mm.",
     2000, "mm",
     ["sbc-201-section-1010"],
     "Door openings within a dwelling unit or sleeping unit shall have a minimum clear opening height of 2000 mm.",
     "SBC-201 Section 1010.1.1 Exception 6 — dwelling unit door height",
     [{"trigger": "min_door_clear_opening_height_dwelling", "value": 2000, "unit": "mm"}],
     []),
    ("SBC-201", "1010.1.1", "exception",
     "In dwelling and sleeping units not required to be Accessible/Type A/Type B, exterior door openings other than the required exit door shall have a minimum clear opening height of 1900 mm.",
     1900, "mm",
     ["sbc-201-section-1010"],
     "In dwelling and sleeping units that are not required to be Accessible, Type A or Type B units, exterior door openings, other than the required exit door, shall have a minimum clear opening height of 1900 mm.",
     "SBC-201 Section 1010.1.1 Exception 7 — exterior dwelling door height",
     [{"trigger": "min_exterior_door_height_nonaccessible", "value": 1900, "unit": "mm"}],
     []),

    # Section 1020.5 dead-end exception
    ("SBC-201", "1020.5", "exception",
     "Dead-end corridor length is unlimited where the length is less than 2.5 times the least width of the dead-end corridor.",
     None, "",
     ["sbc-201-section-1020"],
     "A dead-end corridor shall not be limited in length where the length of the dead-end corridor is less than 2.5 times the least width of the dead-end corridor.",
     "SBC-201 Section 1020.5 Exception 3 — geometry exemption",
     [],
     []),

    # ============================ SBC 801 — CHAPTER 4-7 (gap files) ==========================
    # Section 415 — heat release rate limit on foam plastics in Group A
    ("SBC-801", "806", "threshold",
     "A heat release rate limit of 100 kW, when tested per UL 1975 or NFPA 289, is placed on foam plastic materials used in Group A occupancies.",
     100, "kW",
     ["sbc-801-section-415"],
     "a heat release rate limit of 100 kW, when tested in accordance with UL 1975 or NFPA 289, is placed on foam plastic materials used in Group A occupancies.",
     "SBC-801 Section 415 commentary on Group A foam plastic decorative materials",
     [{"trigger": "max_heat_release_rate", "value": 100, "unit": "kW"}],
     []),

    # Section 411 — water supply for natural cut trees (decorative)
    ("SBC-801", "806.1.2", "threshold",
     "Natural cut tree support device must hold a two-day water supply with a minimum coverage of water to 50 mm above the bottom of the stem.",
     50, "mm",
     ["sbc-801-section-411"],
     "Item 3 requires a minimum coverage of water to 50 mm above the bottom of the stem.",
     "SBC-801 Section 806.1.2 / 411 commentary — natural cut tree water level",
     [{"trigger": "min_water_coverage_above_stem", "value": 50, "unit": "mm"}],
     []),
    ("SBC-801", "806.1.2", "threshold",
     "Natural cut tree support device must be capable of holding a two-day water supply.",
     2, "days",
     ["sbc-801-section-411"],
     "Item 2 states that the device must be capable of holding a two-day water supply",
     "SBC-801 Section 806.1.2 / 411 commentary — water supply duration",
     [{"trigger": "min_water_supply_duration", "value": 2, "unit": "days"}],
     []),

    # Section 418 — sleeping unit decorative wall area allowance
    ("SBC-801", "807.2", "threshold",
     "Section 807.2 Exception 2 allows up to 50 percent of the aggregate wall areas to contain decorative materials if an automatic sprinkler system is provided.",
     50, "percent",
     ["sbc-801-section-418"],
     "Section 807.2, Exception 2 allows up to 50 percent of the aggregate wall areas to contain decorative materials if an automatic sprinkler system is provided.",
     "SBC-801 Section 807.2 Exception 2 / 418 commentary — sleeping unit decorative wall area",
     [{"trigger": "max_aggregate_wall_area_decorative_sprinklered", "value": 50, "unit": "percent"}],
     []),

    # ============================ Additional SBC 201 ch 10 ==========================
    # Section 1020.6 corridors for return air
    ("SBC-201", "1020.6", "exception",
     "Use of a corridor as a source of makeup air for exhaust systems in directly opening rooms is permitted, provided each corridor is supplied with outdoor air at a rate greater than the rate of makeup air taken from the corridor.",
     None, "",
     ["sbc-201-section-1020"],
     "Use of a corridor as a source of makeup air for exhaust systems in rooms that open directly onto such corridors, including toilet rooms, bathrooms, dressing rooms, smoking lounges and janitor closets, shall be permitted, provided that each such corridor is directly supplied with outdoor air at a rate greater than the rate of makeup air taken from the corridor.",
     "SBC-201 Section 1020.6 Exception 1 — makeup air corridors",
     [],
     []),

    # Section 1011 spiral / alternating tread devices headroom
    ("SBC-201", "1011.10", "threshold",
     "Spiral stairways permitted by Section 1011.10 are permitted a 2000 mm headroom.",
     2000, "mm",
     ["sbc-201-section-1011"],
     "Spiral stairways permitted by Section 1011.10 are permitted a 2000 mm headroom",
     "SBC-201 Section 1011.10 — spiral stairway headroom",
     [{"trigger": "min_spiral_stairway_headroom", "value": 2000, "unit": "mm"}],
     []),

    # Section 1011 alternating tread / spiral specifics
    ("SBC-201", "1011.10", "threshold",
     "Spiral stairway riser height shall be 200 mm maximum, tread depth 250 mm minimum at the walkline, and clear width 660 mm minimum where conforming.",
     200, "mm",
     ["sbc-201-section-1011"],
     "be 200 mm; the minimum tread depth shall be 250 mm; the minimum winder tread depth at the walkline shall be 250 mm",
     "SBC-201 Section 1011.10 — spiral stairway riser height",
     [{"trigger": "max_spiral_riser_height", "value": 200, "unit": "mm"}],
     []),
    ("SBC-201", "1011.10", "threshold",
     "Spiral stairway minimum tread depth at the walkline shall be 250 mm.",
     250, "mm",
     ["sbc-201-section-1011"],
     "the minimum tread depth shall be 250 mm; the minimum winder tread depth at the walkline shall be 250 mm",
     "SBC-201 Section 1011.10 — spiral stairway tread depth",
     [{"trigger": "min_spiral_tread_depth", "value": 250, "unit": "mm"}],
     []),

    # Section 1023 high-rise building threshold (23 m above level of exit discharge)
    ("SBC-201", "1023.11", "threshold",
     "High-rise buildings have occupied floors greater than 23 m above the level of exit discharge.",
     23, "m",
     ["sbc-201-section-1023"],
     "levels higher than 23 m above the level of exit",
     "SBC-201 Section 1023.11 — high-rise threshold reference",
     [{"trigger": "high_rise_floor_height_above_exit_discharge", "value": 23, "unit": "m"}],
     []),

    # Section 1020 — corridor width for low occupant load
    ("SBC-201", "1020.3", "threshold",
     "Where the total occupant load served by a corridor is 49 or less, a minimum width of 900 mm is permitted.",
     900, "mm",
     ["sbc-201-section-1020"],
     "less, a minimum width of 900 mm is permitted.",
     "SBC-201 Section 1020.3 — corridor width for low occupant load",
     [{"trigger": "min_corridor_width_low_occupant", "value": 900, "unit": "mm"}],
     []),
    ("SBC-201", "1020.3", "threshold",
     "Passageways that lead to building equipment and systems must be at least 600 mm in width.",
     600, "mm",
     ["sbc-201-section-1020"],
     "and systems must be at least 600 mm in width",
     "SBC-201 Section 1020.3 — equipment access passageway width",
     [{"trigger": "min_equipment_passageway_width", "value": 600, "unit": "mm"}],
     []),

    # Section 1006 single-egress thresholds (Groups H/I/R/S)
    ("SBC-201", "1006.2.1", "threshold",
     "The number of occupants in a single egress unit is limited to 10 for Groups I and R-1.",
     10, "occupants",
     ["sbc-201-section-1006"],
     "the number of occupants in a single egress unit is limited to 10 for Groups I and R-1",
     "SBC-201 Section 1006.2.1 — single egress for Groups I and R-1",
     [{"trigger": "max_occupants_single_egress_groups_i_r1", "value": 10, "unit": "occupants"}],
     []),
    ("SBC-201", "1006.2.1", "threshold",
     "The number of occupants in a single egress unit is limited to 20 for Groups R-2, R-3 and R-4.",
     20, "occupants",
     ["sbc-201-section-1006"],
     "20 for Groups R-2, R-3 and R-4",
     "SBC-201 Section 1006.2.1 — single egress for Groups R-2/R-3/R-4",
     [{"trigger": "max_occupants_single_egress_groups_r2_r3_r4", "value": 20, "unit": "occupants"}],
     []),
    ("SBC-201", "1006.2.1", "threshold",
     "The single egress condition in Groups H-1, H-2 and H-3 is limited to a maximum of three persons.",
     3, "persons",
     ["sbc-201-section-1006"],
     "the single egress condition in Groups H-1, H-2 and H-3 is limited to a maximum of three persons.",
     "SBC-201 Section 1006.2.1 — single egress in high-hazard groups",
     [{"trigger": "max_persons_single_egress_groups_h1_h2_h3", "value": 3, "unit": "persons"}],
     []),
    ("SBC-201", "1006.2.1", "threshold",
     "Group S single egress condition is permitted with an occupant load of 29.",
     29, "occupants",
     ["sbc-201-section-1006"],
     "Group S and the occupants' normal familiarity with the building, the single egress condition is permitted with an occupant load of 29.",
     "SBC-201 Section 1006.2.1 — Group S single egress",
     [{"trigger": "max_occupant_load_single_egress_group_s", "value": 29, "unit": "occupants"}],
     []),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_id(section_ref: str, value, statement: str) -> str:
    h = hashlib.sha256(
        f"{section_ref}|{value}|{statement[:60]}".encode("utf-8")
    ).hexdigest()[:8]
    safe_section = section_ref.replace(".", "-")
    return f"fact-r2-{safe_section}-{h}"


def existing_dedupe_keys(*paths: Path) -> set[tuple[str, str, str]]:
    """Build dedup key set from existing facts files: (section_ref, str(value), statement_prefix)."""
    keys: set[tuple[str, str, str]] = set()
    for path in paths:
        if not path.exists():
            continue
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        for fact in data.get("facts", []):
            sec = fact.get("section_ref", "") or ""
            val = fact.get("value")
            stmt = (fact.get("statement", "") or "")[:60].strip()
            keys.add((sec, str(val), stmt))
    return keys


def build_facts() -> list[dict]:
    dedupe = existing_dedupe_keys(EXISTING_FACTS_FULL, EXISTING_GAP_FACTS)
    out: list[dict] = []
    for entry in CURATED:
        (
            source_code,
            section_ref,
            fact_type,
            statement,
            value,
            unit,
            source_refs,
            source_quote,
            scope,
            conditions,
            exceptions,
        ) = entry
        # Validate banned symbol
        for txt in (statement, source_quote, scope) + tuple(source_refs):
            if BANNED in txt:
                raise ValueError(f"Banned symbol found in entry: {section_ref} :: {statement[:40]}")
        for cond in conditions:
            for v in cond.values():
                if isinstance(v, str) and BANNED in v:
                    raise ValueError("Banned symbol in condition")
        for ex in exceptions:
            if BANNED in ex:
                raise ValueError("Banned symbol in exception")
        if not source_refs:
            raise ValueError(f"Empty source_refs for {section_ref}")
        if not source_quote.strip():
            raise ValueError(f"Empty source_quote for {section_ref}")
        # Dedupe
        key = (section_ref, str(value), statement[:60].strip())
        if key in dedupe:
            continue
        dedupe.add(key)
        fact_id = make_id(section_ref, value, statement)
        out.append({
            "id": fact_id,
            "source_code": source_code,
            "section_ref": section_ref,
            "fact_type": fact_type,
            "statement": statement,
            "value": value,
            "unit": unit,
            "scope": scope,
            "conditions": conditions,
            "exceptions": exceptions,
            "source_refs": source_refs,
            "source_quote": source_quote,
            "applicable_modes": ["main", "advisory", "analytical"],
            "confidence": "high",
            "not_citable_without_source_refs": True,
        })
        if len(out) >= 80:
            break
    return out


def chapter_for(source_code: str, section_ref: str, source_refs: list[str]) -> str:
    """Derive chapter from the source_refs file path (the actual gap source),
    not the cross-referenced section_ref. e.g. sbc-801-section-411 -> ch.4."""
    # Use the first source_ref to get the actual section file mined
    src = source_refs[0] if source_refs else ""
    # Extract the section number after 'section-'
    m = re.search(r"section-(\d+)", src)
    if m:
        sec = m.group(1)
        # 4-digit (e.g. 1006) -> first 2 chars; 3-digit (e.g. 415, 704) -> first char
        if len(sec) == 4:
            ch = sec[:2]
        elif len(sec) == 3:
            ch = sec[0]
        else:
            ch = sec
        return f"{source_code} ch.{ch}"
    # Fallback to section_ref
    chap = section_ref.split(".")[0]
    if chap.isdigit():
        if len(chap) == 4:
            ch = chap[:2]
        elif len(chap) == 3:
            ch = chap[0]
        else:
            ch = chap
        return f"{source_code} ch.{ch}"
    return f"{source_code} ch.{chap}"


def main() -> dict:
    facts = build_facts()
    payload = {
        "schema_version": 2,
        "generated_at": now_iso(),
        "generated_by": "sub-agent-b4-round2",
        "code_basis": ["SBC-201-CC-2024", "SBC-801-CC-2024"],
        "additive_to": ["facts_full.json", "gap_completion_facts.json"],
        "round": 2,
        "cap": 80,
        "fact_count": len(facts),
        "facts": facts,
    }
    OUT_FACTS.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FACTS, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)

    # Histograms
    by_type = Counter(f["fact_type"] for f in facts)
    by_chapter = Counter(chapter_for(f["source_code"], f["section_ref"], f["source_refs"]) for f in facts)
    by_source_code = Counter(f["source_code"] for f in facts)

    # Top thresholds
    top_thresholds = []
    for f in facts:
        if f["fact_type"] == "threshold" and isinstance(f["value"], (int, float)):
            top_thresholds.append({
                "section_ref": f["section_ref"],
                "source_code": f["source_code"],
                "value": f["value"],
                "unit": f["unit"],
                "id": f["id"],
            })
    top_thresholds.sort(key=lambda x: (x["source_code"], x["section_ref"]))
    top5 = top_thresholds[:5]

    # Hashes
    sha = {}
    for path in (OUT_FACTS,):
        with open(path, "rb") as fh:
            sha[path.name] = hashlib.sha256(fh.read()).hexdigest()

    # Banned grep — count occurrences in output
    text = OUT_FACTS.read_text(encoding="utf-8")
    banned_count = text.count(BANNED)

    # Validation
    all_have_refs = all(f["source_refs"] for f in facts)
    all_have_quote = all(f["source_quote"].strip() for f in facts)

    report = {
        "generated_at": now_iso(),
        "agent": "sub-agent-b4-round2",
        "new_fact_count": len(facts),
        "by_type": dict(by_type),
        "by_chapter": dict(by_chapter),
        "by_source_code": dict(by_source_code),
        "top5_new_thresholds": top5,
        "validation": {
            "all_have_source_refs": all_have_refs,
            "all_have_source_quote": all_have_quote,
            "no_banned_symbol": banned_count == 0,
            "banned_symbol_count": banned_count,
            "deduplicated_against_facts_full_and_gap_completion": True,
            "cap_respected": len(facts) <= 80,
        },
        "outputs": {
            "facts_path": str(OUT_FACTS),
            "report_md": str(OUT_REPORT_MD),
            "report_json": str(OUT_REPORT_JSON),
        },
        "sha256": sha,
    }
    OUT_REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_REPORT_JSON, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)

    md_lines = [
        "# Round 2 Facts Expansion Report (Sub-agent B4)",
        "",
        f"- audited_at: {report['generated_at']}",
        f"- agent: {report['agent']}",
        f"- new_facts: {report['new_fact_count']}",
        f"- by_type: {dict(by_type)}",
        f"- by_source_code: {dict(by_source_code)}",
        f"- by_chapter: {dict(by_chapter)}",
        "- additive_to: facts_full.json + gap_completion_facts.json",
        "- cap: 80",
        "",
        "## Validation",
        f"- all_have_source_refs: {all_have_refs}",
        f"- all_have_source_quote: {all_have_quote}",
        f"- no_banned_symbol: {banned_count == 0}",
        f"- banned_symbol_count: {banned_count}",
        "",
        "## Top 5 new thresholds",
    ]
    for t in top5:
        md_lines.append(
            f"- {t['source_code']} Section {t['section_ref']}: value={t['value']} {t['unit']} (id {t['id']})"
        )
    md_lines.extend([
        "",
        "## SHA-256",
    ])
    for name, h in sha.items():
        md_lines.append(f"- {name}: {h}")
    OUT_REPORT_MD.write_text("\n".join(md_lines) + "\n", encoding="utf-8")

    return report


if __name__ == "__main__":
    rep = main()
    print(json.dumps({
        "new_fact_count": rep["new_fact_count"],
        "by_type": rep["by_type"],
        "by_chapter": rep["by_chapter"],
        "validation": rep["validation"],
        "sha256": rep["sha256"],
    }, indent=2))
