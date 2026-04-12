-- Section 417: Drying Rooms (canonical scope = Sections 417.1 through 417.4)
INSERT INTO sbc_code_tables (
  table_id, table_title, source_code, edition, chapter, section,
  content_md, keywords, notes
) VALUES (
  '417',
  'Drying Rooms - Noncombustible Construction, Piping Clearance, Insulation, Fire Protection',
  'SBC 201',
  '2021',
  4,
  '417 Drying Rooms',
$m$## Section 417 - Drying Rooms (structured record)
This record is strictly grounded in the canonical Section 417 text and commentary scope for this pass.

### Canonical source trace
- `SBC_201_CC_2024/SBC 201 - The Saudi General Building Code-251-500.pdf`
- p. 352: `SECTION 417`, `417.1 General`
- p. 353: `417.2 Piping clearance`, `417.3 Insulation`, `417.4 Fire protection`

### Rule record
| Rule ID | Condition | Requirement |
|---|---|---|
| 417.1 | Drying room or dry kiln installed within a building | Construct entirely of approved noncombustible materials or assemblies of such materials, regulated by approved rules / Chapter 4 special occupancies and where applicable SBC 501 |
| 417.2 | Overhead heating pipes in dryer | Clearance not less than 50 mm from combustible contents in the dryer |
| 417.3 | Dryer operating temperature is 80 C or more | Metal enclosures insulated from adjacent combustibles by not less than 300 mm airspace, or metal walls lined with 6.5 mm insulating mill board or approved equivalent |
| 417.4 | Drying rooms designed for high-hazard materials/processes, including special occupancies in Chapter 4 | Protect with an approved automatic fire-extinguishing system complying with Chapter 9 |

### Condition matrix (highest-value conditions)
| Operating condition | Required control |
|---|---|
| Dryer < 80 C | 417.3 insulation threshold not triggered by temperature condition |
| Dryer >= 80 C | Apply 417.3 insulation rule (300 mm airspace OR 6.5 mm insulating mill board/equivalent) |
| High-hazard material/process present | Apply 417.4 approved automatic fire-extinguishing system per Chapter 9 |
| Overhead heating pipes present | Maintain 50 mm minimum clearance from combustibles (417.2) |

### Constrained decision tree
1. Is it a drying room or dry kiln installed within a building?
   - No -> Section 417 does not apply.
   - Yes -> continue.
2. Enforce 417.1 baseline:
   - Noncombustible construction/material assemblies.
3. Are overhead heating pipes present?
   - Yes -> maintain >= 50 mm clearance from combustibles (417.2).
4. Is operating temperature >= 80 C?
   - Yes -> apply insulation requirement from 417.3.
5. Is the process high-hazard material/process (including Chapter 4 special occupancies)?
   - Yes -> approved automatic fire-extinguishing system per Chapter 9 is required (417.4).

### Explicit routing linkage to existing covered records
- Source commentary note under 417.1 states drying operations associated with application of flammable finishes are regulated by **Section 416**.
- Source commentary under 417.4 points to Chapter 9 fire-extinguishing path; when alternative systems are queried, routing can also involve existing **Section 904** coverage.
$m$,
  ARRAY[
    'drying room',
    'drying rooms',
    'dry kiln',
    'section 417',
    '417',
    'overhead heating pipes clearance',
    '50 mm clearance',
    '80 c dryer insulation',
    '300 mm airspace insulation',
    '6.5 mm insulating mill board',
    'high-hazard drying room fire protection',
    'chapter 9 fire extinguishing drying room',
    'غرفة التجفيف',
    'غرف التجفيف',
    'المادة 417',
    'خلوص 50 مم',
    'عزل 80 درجة مئوية'
  ],
  'Source trace: SBC_201_CC_2024/SBC 201 - The Saudi General Building Code-251-500.pdf pages 352-353. Structured scope includes only Sections 417.1 through 417.4.'
) ON CONFLICT (table_id, source_code, edition) DO UPDATE
  SET table_title = EXCLUDED.table_title,
      content_md  = EXCLUDED.content_md,
      keywords    = EXCLUDED.keywords,
      notes       = EXCLUDED.notes;
