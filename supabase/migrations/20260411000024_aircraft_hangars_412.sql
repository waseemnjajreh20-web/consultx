-- Section 412: Aircraft-Related Occupancies (core scoped pass = Section 412.3 commercial aircraft hangars)
INSERT INTO sbc_code_tables (
  table_id, table_title, source_code, edition, chapter, section,
  content_md, keywords, notes
) VALUES (
  '412',
  'Aircraft-Related Occupancies - Core Commercial Hangar Path (Section 412.3)',
  'SBC 201',
  '2021',
  4,
  '412 Aircraft-Related Occupancies (core: 412.3 Commercial Hangars)',
$m$## Section 412 - Aircraft-Related Occupancies (core structured record)
Pass scope in this continuation is intentionally limited to the highest-value operational path: **Section 412.3 commercial aircraft hangars**.

### Canonical source trace
- `SBC_201_CC_2024/SBC 201 - The Saudi General Building Code-251-500.pdf`
- p. 313: `412.3`, `412.3.1`, `412.3.2`, `412.3.3`
- p. 314: `412.3.4`, `412.3.5`, `412.3.6`
- p. 315: `412.3.6.1`, `412.3.6.2`
- p. 378: `Table 412.3.6` + notes (a), (b), (c)

### Deliberately deferred 412 subareas
- `412.2` airport traffic control towers
- `412.4` residential aircraft hangars
- `412.6` aircraft manufacturing facilities
- `412.7` heliports and helistops

### Rule record - Section 412.3
| Rule ID | Condition | Requirement |
|---|---|---|
| 412.3.1 | Exterior wall is less than 9 m from lot lines or a public way | Exterior wall fire-resistance rating not less than 2 hours |
| 412.3.2 | Hangar has basements | Floor over basement: Type IA; floor made tight against seepage of water/oil/vapors; no openings/communication between basement and hangar; basement access from outside only |
| 412.3.3 | Hangar floor design | Floors graded and drained to prevent water/fuel remaining on floor; floor drains discharge through oil separator to sewer or outside vented sump |
| 412.3.3-EXC | Individual lease spaces <= 185 m2 and no servicing/repairing/washing and no fuel dispensing | Floors graded toward door; separator not required |
| 412.3.4 | Heating equipment in hangar | Place in another room separated by 2-hour fire barriers/horizontal assemblies; entrance from outside or by vestibule with two-doorway separation |
| 412.3.4-EXC1 | Unit heaters / vented infrared radiant equipment | Separate room not required if suspended >= 3 m above highest wing/engine enclosure and mounted >= 2.4 m above floor in communicating shop/office sections |
| 412.3.4-EXC2 | Sources of ignition in separated room are >= 450 mm above floor | Single interior door is permitted |
| 412.3.5 | Doping/painting uses volatile flammable solvent | Operation must be in separate detached building equipped with automatic fire-extinguishing equipment per Section 903 |
| 412.3.6 | Fire suppression for aircraft hangars | Provide fire suppression system designed per NFPA 409 based on Table 412.3.6 classification |
| 412.3.6-EXC | Group II hangar used only for transient aircraft storage by fixed base operator with separate repair facilities on site | Fire suppression still required, but foam requirement is exempt |
| 412.3.6.1 | Group III hangar includes listed hazardous operations | Provide Group I or Group II fire suppression per NFPA 409 as applicable |
| 412.3.6.2 | Maximum single fire area separation | Areas from Table 412.3.6 are separated by 2-hour fire walls; ancillary uses separated from aircraft servicing areas by >= 1-hour fire barrier are excluded from area calculation |

### Condition matrix - Table 412.3.6 hangar fire suppression grouping
| Maximum single fire area (m2) | IA | IB | IIA | IIB | IIIA | IIIB | IV | VA | VB |
|---|---|---|---|---|---|---|---|---|---|
| >= 3,701 | Group I | Group I | Group I | Group I | Group I | Group I | Group I | Group I | Group I |
| 3,700 | Group II | Group II | Group II | Group II | Group II | Group II | Group II | Group II | Group II |
| 2,800 | Group III | Group II | Group II | Group II | Group II | Group II | Group II | Group II | Group II |
| 1,900 | Group III | Group III | Group II | Group II | Group II | Group II | Group II | Group II | Group II |
| 1,400 | Group III | Group III | Group III | Group II | Group III | Group II | Group III | Group II | Group II |
| 1,100 | Group III | Group III | Group III | Group III | Group III | Group III | Group III | Group II | Group II |
| 750 | Group III | Group III | Group III | Group III | Group III | Group III | Group III | Group III | Group II |
| 465 | Group III | Group III | Group III | Group III | Group III | Group III | Group III | Group III | Group III |

Table notes from source:
1. Door height > 8.5 m => provide Group I suppression regardless of maximum fire area.
2. Group classification is per NFPA 409.
3. Membrane structures complying with Section 3102 are Group IV hangars.

### Hazardous operations trigger list (412.3.6.1)
For Group III hangars, any of the following triggers Group I/II suppression path per NFPA 409:
1. Doping.
2. Hot work (including welding, torch cutting, torch soldering).
3. Fuel transfer.
4. Fuel tank repair/maintenance (excluding defueled tanks per NFPA 409, inerted tanks, or never-fueled tanks).
5. Spray finishing operations.
6. Total fuel capacity in unsprinklered single fire area exceeds 6,000 L.
7. Total fuel capacity in maximum single fire area exceeds 28,000 L for hangar with automatic sprinkler system per Section 903.3.1.1.

### Constrained decision tree (operational)
1. Is the question within commercial aircraft hangar scope (412.3)?
   - No: use deferred 412 subarea path.
   - Yes: continue.
2. Classify suppression group using Table 412.3.6 (construction type + max single fire area).
3. Apply table notes:
   - Door height > 8.5 m => Group I suppression.
   - Membrane structure => Group IV.
4. If Group III, check hazardous operations list from 412.3.6.1:
   - Any trigger present => Group I/II suppression per NFPA 409.
5. Apply base hangar constraints in parallel:
   - Exterior wall rating (412.3.1)
   - Basement separation/sealing (412.3.2)
   - Floor grading/drainage/oil separator (412.3.3)
   - Heating equipment separation (412.3.4)
   - Detached building for doping/painting (412.3.5)

### Routing linkage to covered records
- Explicit source linkage: **Section 412.5** (deferred in this pass) states that use of flammable finishes in aircraft paint hangars must comply with **Section 416**.
$m$,
  ARRAY[
    'aircraft-related occupancies',
    'aircraft hangar',
    'commercial aircraft hangar',
    'section 412',
    '412',
    '412.3',
    'table 412.3.6',
    'nfpa 409',
    'hangar fire suppression',
    'hangar hazardous operations',
    'hangar floor drain',
    'hangar oil separator',
    'aircraft paint hangar',
    'حظيرة طائرات',
    'المادة 412',
    'جدول 412.3.6'
  ],
  'Source trace: SBC_201_CC_2024/SBC 201 - The Saudi General Building Code-251-500.pdf pages 313-315 and 378. Scoped intentionally to Section 412.3 in this pass.'
) ON CONFLICT (table_id, source_code, edition) DO UPDATE
  SET table_title = EXCLUDED.table_title,
      content_md  = EXCLUDED.content_md,
      keywords    = EXCLUDED.keywords,
      notes       = EXCLUDED.notes;
