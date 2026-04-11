-- Decision Logic v4: 907.4.2 (Manual Fire Alarm Boxes) + 903.4.3 (Floor Control Valves)
-- Source: SBC 801-CC-2024, Chapter 9
-- Canonical text verified against sbc_documents chunks id=4198 (907.4.2) and id=3914 (903.4.3)
-- NOTE: 903.5 in SBC 801 is "Testing and maintenance" — floor control valves are in 903.4.3

INSERT INTO sbc_code_tables (
  table_id, table_title, source_code, edition, chapter, section,
  content_md, keywords, notes, supersedes
) VALUES

-- ============================================================
-- 907.4.2 — Manual Fire Alarm Box Specifications
-- ============================================================
(
  '907.4.2',
  'Manual Fire Alarm Boxes — Location, Height, Color, Signs',
  'SBC 801',
  '2024',
  '9',
  '907.4.2',
  $md$
## Section 907.4.2 — Manual Fire Alarm Boxes | SBC 801: 2024

### When Required
Manual fire alarm boxes are required wherever a **manual fire alarm system** is required by **Section 907.2** (occupancy-specific triggers — A, B, E, F, H, I, M, R, S). The specifications below govern all required boxes.

### Key Exception: Sprinkler Substitution (Boxes May Be Omitted)
In certain occupancies, manual fire alarm boxes may be **omitted** when the building is protected by an automatic sprinkler system whose waterflow activates the occupant notification system. Occupancy-specific exceptions include:

| Occupancy | Condition for Omitting Boxes |
|---|---|
| Group A (907.2.1) | Sprinkler waterflow activates alarm system |
| Group E (907.2.3 Exc. 4) | Sprinklered per NFPA 13 and actuation activates EV/ACS |
| Group I-1/I-2 (907.2.6.1 Exc. 1) | Boxes in sleeping units relocated to nurses'/staff stations; travel distance per 907.4.2.1 not exceeded |
| Group R-2 (907.2.9) | Sprinkler waterflow initiates alarm in lieu of manual boxes |

> **Note**: The exception does NOT eliminate the fire alarm system. It permits the system to be initiated automatically by sprinkler waterflow instead of by manual box activation.

---

### 907.4.2.1 Location
Manual fire alarm boxes shall be located **not more than 1.5 m** from the entrance to each exit.

In buildings **not** protected by an automatic sprinkler system in accordance with Section 903.3.1.1 or 903.3.1.2, additional manual fire alarm boxes shall be located so that the distance of travel to the nearest box does **not exceed 60 m**.

| Building Condition | Location Requirement |
|---|---|
| All buildings (sprinklered or not) | Within 1.5 m of each exit entrance |
| Non-sprinklered buildings | Additional boxes: travel ≤ 60 m to nearest box |
| Sprinklered buildings (NFPA 13/13R) | Only exit-proximity rule applies (60 m rule waived) |

### 907.4.2.2 Height
Not less than **1,000 mm** and not more than **1,200 mm** above the floor level, measured vertically to the activating handle or lever of the box.

### 907.4.2.3 Color
Manual fire alarm boxes shall be **red** in color.

### 907.4.2.4 Signs
Where fire alarm systems are **not monitored** by an approved supervising station per Section 907.6.6, an approved permanent sign shall be installed adjacent to each manual fire alarm box reading:

> **"WHEN ALARM SOUNDS—CALL FIRE DEPARTMENT"**

**Exception:** Where the manufacturer has permanently provided this information on the manual fire alarm box.

### 907.4.2.5 Protective Covers
The Fire official is authorized to require listed manual fire alarm box protective covers to reduce false alarms.
$md$,
  ARRAY[
    'manual fire alarm box', 'pull station', 'fire alarm box', 'manual alarm box',
    'fire alarm initiating device', 'fire alarm box location', 'fire alarm box height',
    'pull station location', 'pull station height', 'pull station exception',
    'manual alarm not required', 'sprinkler alarm substitution',
    '907.4', '907.4.2', '907.4.2.1', '907.4.2.2'
  ],
  'Covers physical installation specs for manual fire alarm boxes (907.4.2). The WHERE REQUIRED decision (which occupancies need a manual fire alarm system) is in Section 907.2. The sprinkler substitution exception allows boxes to be omitted in fully sprinklered buildings in several occupancy groups.',
  ARRAY[]::text[]
),

-- ============================================================
-- 903.4.3 — Floor Control Valves (High-Rise Buildings)
-- ============================================================
(
  '903.4.3',
  'Floor Control Valves — High-Rise Sprinkler Systems',
  'SBC 801',
  '2024',
  '9',
  '903.4.3',
  $md$
## Section 903.4.3 — Floor Control Valves | SBC 801: 2024

### Normative Requirement
**903.4.3 Floor control valves.** Approved supervised indicating control valves shall be provided at the point of connection to the riser on each floor in **high-rise buildings**.

### Decision Table

| Building Type | Floor Control Valve Requirement |
|---|---|
| **High-rise building** | REQUIRED — at riser connection on EVERY floor |
| Non-high-rise building | NOT REQUIRED under 903.4.3 |
| 1- and 2-family dwellings (NFPA 13D) | NOT REQUIRED (903.4 Exception 1) |

### Valve Specifications
- **Type**: Approved supervised **indicating** control valve
- **Location**: At the point of connection to the riser on **each floor**
- **Supervision**: Electrically supervised per Section 903.4 (listed fire alarm control unit)

### Purpose
Floor control valves permit isolation of an individual floor's sprinkler system for servicing or post-activation reset without impairing the water supply to other floors of the high-rise building.

### Cross-References
| Section | Subject |
|---|---|
| 903.4 | General sprinkler supervision — all control valves electrically supervised |
| 903.4.1 | Monitoring — alarms/supervisory signals transmitted to supervising station |
| 904.11.2.3 | Water mist systems — floor control valves also required per 903.4.3 |
| 914.3.1 | High-rise sprinkler requirements (NFPA 13 throughout) |

> **Important**: SBC 801 Section 903.5 is "Testing and Maintenance" — it is NOT the floor control valve section. Floor control valves are exclusively in Section 903.4.3.
$md$,
  ARRAY[
    'floor control valve', 'riser control valve', 'zone control valve',
    'sprinkler floor isolation', 'isolation valve sprinkler', 'floor sprinkler valve',
    'sprinkler zone control', 'riser valve floor', 'high-rise sprinkler valve',
    'floor by floor valve', '903.4.3'
  ],
  'Floor control valves are a HIGH-RISE ONLY requirement (903.4.3). Non-high-rise buildings are not subject to this section. Common confusion: 903.5 is testing/maintenance — NOT floor control valves.',
  ARRAY[]::text[]
)

ON CONFLICT (table_id, source_code, edition) DO UPDATE
SET
  table_title = EXCLUDED.table_title,
  content_md  = EXCLUDED.content_md,
  keywords    = EXCLUDED.keywords,
  notes       = EXCLUDED.notes;
