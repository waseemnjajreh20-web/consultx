# Advisory Section-Number Canonical Map — Manual Review Priority

Generated: 2026-05-01T01:24:38.697Z
Project: `hrnltxmwoaphgejckutk`

**READ-ONLY.** No DB writes, no UPDATE/INSERT/DELETE/UPSERT/DDL/migrations.

This is a manual review queue. The accompanying CSV (`reports/advisory-section-canonical-map-review.csv`) contains the full set of mismatch rows with blank columns for the reviewer to fill: `proposed_section_number`, `confidence`, `reviewer_notes`.

Detector tightened vs Step 2: matches preceded by `see`, `per`, `in accordance with`, `complying with`, `pursuant to`, `as required by`, or `Section` (cross-ref) are now disqualified. Multi-section chunks are flagged as `split_chunk_candidate`.

## Counts
- Total rows scanned: **4630**
- Mismatch rows in CSV: **3269**

By classification:
- `no_detectable_heading`: 2004
- `exact_match`: 1361
- `body_heading_child_of_section_number`: 359
- `no_detectable_heading_and_no_label`: 354
- `suspicious_cross_chapter_label`: 335
- `body_heading_differs_from_section_number`: 216
- `section_number_parent_only`: 1

By recommended action:
- `split_chunk_candidate`: 1677
- `do_not_touch`: 1412
- `manual_review`: 120
- `safe_auto_candidate`: 60

## 1. Group M sprinkler trigger rows (`1,115 m²` / `Group M` / `Mercantile`)

These are the rows where the Advisory's incorrect 99% Group M answer was rooted. Each row contains either the trigger value or Mercantile / 903.x context.

| id | file (short) | page | current_section | detected_heading | type | action | snippet |
|---|---|---|---|---|---|---|---|
| 283 | SBC 201 [1-250] | 230-250 | `5003.9.10` | `(none)` | no_detectable_heading | do_not_touch | SBC 201-CC-2024 207 e. Maximum allowable quantities shall be increased 100 percent when stored in approved storage cabinets, day boxes, gas cabinets, gas rooms or exhausted enclosures or in listed saf |
| 284 | SBC 201 [1-250] | 230-250 | `414.2` | `(none)` | no_detectable_heading | do_not_touch | MATERIAL STORAGEb USE-CLOSED SYSTEMSb USE-OPEN SYSTEMSb Solid, kgd, e Liquid liters (kg)d, e Gas cubic meters at NTP (kg)d Solid, kgd Liquid liters (kg)d Gas m3 at NTP (kg)d Solid, kgd Liquid liters ( |
| 288 | SBC 201 [1001-1250] | 1-23 | `402.5` | `(none)` | no_detectable_heading | do_not_touch | CHAPTER 9—FIRE PROTECTION SYSTEMS SBC 201-CC-2024 973 Occupancy Threshold Exception All occupancies Buildings with floor level ≥ 16.5 m above fire department vehicle access and occupant load ≥ 30. Ope |
| 470 | SBC 201 [1001-1250] | 143-143 | `404.10` | `1017.3.2.1` | suspicious_cross_chapter_label | split_chunk_candidate | CHAPTER 10—MEANS OF EGRESS SBC 201-CC-2024 1115 through or around the atrium, paths that are on floor that is the bottom of the atrium, and where the path of travel is around the atrium or uses an exi |
| 1583 | SBC 201 [251-500] | 15-246 | `707.3.10` | `(none)` | no_detectable_heading | do_not_touch | Group M area = 975 m2. Group A-3 area = 975 m2. Group B area = 1950 m2 [combined area for two stories, each 975 m2]. Because of the construction required in this example for each separation, these occ |
| 1716 | SBC 201 [251-500] | 79-224 | `508.4` | `(none)` | no_detectable_heading | do_not_touch | 1 Occupancies that are to be evaluated as separated occupancies must be separated in accordance with Table 508.4. When the table requires a separation, the occupancies must be separated completely, bo |
| 1743 | SBC 201 [251-500] | 101-104 | `414.2.2` | `(none)` | no_detectable_heading | split_chunk_candidate | ❖ The maximum quantity of hazardous materials permitted in a building without classifying the building as a Group H, high-hazard occupancy is regulated per control area and not per building area. The  |
| 2204 | SBC 201 [501-1000] | 350-360 | `903.2.2` | `(none)` | no_detectable_heading | split_chunk_candidate | This section addresses the issue of multiple small assembly occupancies placed in a single-story building and not triggering a sprinkler system requirement because of the installation of a rated corri |
| 2206 | SBC 201 [501-1000] | 350-360 | `903.2.4` | `903.2.4.2` | body_heading_child_of_section_number | split_chunk_candidate | The extent of sprinkler coverage is only intended to be for the Group F-1 occupancy involved in the wood-working activity. If the fire area is larger than 230 m2 but the wood- working area is 230 m2 o |
| 2208 | SBC 201 [501-1000] | 350-360 | `903.3.1` | `(none)` | no_detectable_heading | split_chunk_candidate | where care is provided has not fewer than one exterior exit door. 3 In buildings where Group I-4 day care is provided on levels other than the level of exit discharge, an automatic sprinkler system in |
| 2212 | SBC 201 [501-1000] | 361-361 | `903.2.9` | `(none)` | no_detectable_heading | split_chunk_candidate | CHAPTER 9—FIRE PROTECTION SYSTEMS SBC 201-CC-2024 833 area. In addition, any Group S-1 fire area intended for the repair of commercial motor vehicles that exceeds 465 m2 would require sprinklers. This |
| 2291 | SBC 201 [501-1000] | 411-435 | `907.2.6` | `(none)` | no_detectable_heading | do_not_touch | ❖ Because of the potential for intentional false alarms and the resulting disruption to the facility, manual fire alarm boxes in Group I-3 occupancies may be either locked or made inaccessible to the  |
| 2292 | SBC 201 [501-1000] | 411-435 | `508.4.1` | `(none)` | no_detectable_heading | split_chunk_candidate | The extent of fire alarm application is based on the area in which the Group M occupancy is located. If the building is considered as a separated mixed occupancy, then the fire alarm system is only re |
| 2628 | SBC 801 [1001-1200] | 21-25 | `1030.9.5` | `(none)` | no_detectable_heading | do_not_touch | OCCUPANCY COMMON PATH LIMIT DEAD-END LIMIT TRAVEL DISTANCE LIMIT Unsprinklered (m) Sprinklered (m) Unsprinklered (m) Sprinklered (m) Unsprinklered (m) Sprinklered (m) Group A 23 23j 6a 6a 60 75j Group |
| 3190 | SBC 801 [1401-1600] | 120-142 | `5003.8.3` | `5003.1.1` | body_heading_differs_from_section_number | manual_review | SBC 801-CC-2024 1499 a. For use of control areas, see Section 5003.8.3. TABLE 5003.1.1(1) —continued MAXIMUM ALLOWABLE QUANTITY PER CONTROL AREA OF HAZARDOUS MATERIALS POSING A PHYSICAL HAZARDa, j, m, |
| 3221 | SBC 801 [1401-1600] | 155-159 | `5106.2.5` | `(none)` | no_detectable_heading | split_chunk_candidate | ❖ Removing combustible cartons from display areas reduces the potential fuel supply in case of a fire and also removes the combustible material that would surround the aerosol containers and heat them |
| 3560 | SBC 801 [1801-2061] | 10-260 | `5104.4.1` | `(none)` | no_detectable_heading | do_not_touch | Aerosol warehouses ……………………….5104.4.1 Alarms. . . . . . . . . . . . . . . . . .. . . . 903.4.2, 2703.10.5 Basements …………………...………..903.2.11.1.3 Chutes …………………………...……….1103.4.9.3 Defined ………………………………S |
| 3941 | SBC 801 [1801-2061] | 10-260 | `5706.5.4` | `(none)` | no_detectable_heading | do_not_touch | MOBILE FUELING ................................... 5706.5.4.5 Defined ................................................. SECTION 202 MODIFICATIONS (of code requirements) .. 104.9 MONITORING (sprinkler  |
| 3944 | SBC 801 [1801-2061] | 10-260 | `5608.2.2` | `(none)` | no_detectable_heading | do_not_touch | SECTION 202 Displays ......................................................... 5608.2.2 PSYCHIATRIC HOSPITAL (see HOSPITALS AND PSYCHIATRIC HOSPITALS) PUBLIC ASSEMBLAGES AND EVENTS ……………………………………...…S |
| 3649 | SBC 801 [1801-2061] | 87-88 | `6603.1.2` | `6603.1.2.1` | body_heading_child_of_section_number | split_chunk_candidate | ❖ Because unstable (reactive) materials may be needed in certain occupancies, Sections 6603.1.2.1through 6603.1.2.5provide regulations that are specific to occupancy group classifications and that rec |
| 4088 | SBC 801 [401-600] | 73-85 | `903.2.3` | `(none)` | no_detectable_heading | split_chunk_candidate | ❖ Ambulatory care facilities are Group B occupancies, which have an enhanced set of requirements that account for the fact that patients may be incapable of self-preservation and require rescue by oth |
| 4089 | SBC 801 [401-600] | 73-85 | `707.3.10` | `(none)` | no_detectable_heading | split_chunk_candidate | The following examples illustrate how the criteria of this section are intended to be applied:: • If a building contains a single fire area of Group F-1 and the fire area is 1200 m2, an automatic spri |
| 4092 | SBC 801 [401-600] | 73-85 | `308.6.1` | `(none)` | no_detectable_heading | split_chunk_candidate | Group I-4 occupancies would include either adult only care facilities or occupancies that provide personal care for more than five children, 21/2 years of age or younger, on a less than 24-hour basis. |
| 4093 | SBC 801 [401-600] | 73-85 | `903.2.7` | `903.2.7.2` | body_heading_child_of_section_number | split_chunk_candidate | ❖ Regardless of the size of the Group M fire area, an automatic sprinkler system may be required in a high-piled storage area. High-piled storage includes piled, palletized, bin box, shelf or rack sto |
| 4096 | SBC 801 [401-600] | 73-85 | `903.2.9` | `903.2.9.3` | body_heading_child_of_section_number | split_chunk_candidate | Whether the volume of tires is divided into different fire areas or not is irrelevant to the application of this section. If the total for all areas where tires are stored is great enough that the res |
| 4126 | SBC 801 [401-600] | 89-155 | `903.2.6` | `907.2.7` | suspicious_cross_chapter_label | split_chunk_candidate | Exception 3 allows smoke detectors to be omitted in sleeping units housing no more than four occupants on the basis that in a building that is protected throughout with an approved automatic sprinkler |
| 4309 | SBC 801 [601-800] | 37-68 | `402.5` | `(none)` | no_detectable_heading | do_not_touch | Occupancy Threshold Exception All occupancies Buildings with floor level ≥ 16.5 m above fire department vehicle access and occupant load ≥ 30. Open parking structures. F-2 Assembly (A-1, A-3, A-4) Fir |

Total Group M / Mercantile / 903.x rows in review: **27**.

**Recommended handling:** rows where action is `split_chunk_candidate` cannot be fixed by retagging — they need an ingestion-time chunk split (the chunk straddles two distinct sections). Rows tagged `manual_review` need a reviewer to confirm the correct section_number from the body's leading heading.

## 2. Fire-alarm Group M rows (`907.2.7` / `manual fire alarm` / `waterflow`)

| id | file (short) | page | current_section | detected_heading | type | action | snippet |
|---|---|---|---|---|---|---|---|
| 291 | SBC 201 [1001-1250] | 1-23 | `904.11` | `(none)` | no_detectable_heading | do_not_touch | SBC 201-CC-2024 982 FIGURE 904.11 WATER MIST NOZZLE DISCHARGE FIGURE 905.3.1(1) HEIGHT THRESHOLD FOR STANDPIPES - CHAPTER 9—FIRE PROTECTION SYSTEMS SBC 201-CC-2024 983 FIGURE 905.3.1(2) HEIGHT REQUIRE |
| 292 | SBC 201 [1001-1250] | 1-23 | `907.2.1` | `(none)` | no_detectable_heading | do_not_touch | [Table table_p12_1] Headers: MANUAL FIRE ALARM SYSTEM Occupancy Group(s) \| Threshold Assembly (A-1, A-2, A-3, A-4, A-5) \| All with an occupant load of > 300 (907.2.1 ) Business (B) \| Total Group B occ |
| 1607 | SBC 201 [251-500] | 16-232 | `907.2.9` | `508.5.8` | suspicious_cross_chapter_label | split_chunk_candidate | This Section requires the installation of a fire alarm system as required for a Group R-2 occupancy. Section 907.2.9 would only require a fire alarm system in certain cases. The requirements for a man |
| 1628 | SBC 201 [251-500] | 24-77 | `405.4.1` | `405.6` | body_heading_differs_from_section_number | split_chunk_candidate | ❖ The compartmentation referred to in this section is that discussed in Section 405.4.1, which requires that the building be separated from the story of level of exit discharge to the lowest level in  |
| 1698 | SBC 201 [251-500] | 63-140 | `407.5.4` | `422.4` | suspicious_cross_chapter_label | split_chunk_candidate | ❖ This Section is conceptually linked to Section 407.5.4 and requires that occupants should be able to exit the building without having to reenter a smoke compartment from where they started. Although |
| 2230 | SBC 201 [501-1000] | 365-484 | `907.2.3` | `(none)` | no_detectable_heading | split_chunk_candidate | This section more specifically states that any time a fire area contains an ambulatory care facility, the fire area should be provided with a supervised smoke detection system in the ambulatory care f |
| 2231 | SBC 201 [501-1000] | 365-484 | `903.2.3` | `(none)` | no_detectable_heading | split_chunk_candidate | Exception 1 exempts Group E occupancies from requiring a fire alarm system when the occupant load is less than 50. This would exempt small day care centers that serve children older than 2½ years of a |
| 2232 | SBC 201 [501-1000] | 365-484 | `307.1` | `907.2.6` | suspicious_cross_chapter_label | manual_review | This section also requires an automatic smoke detection system in certain occupancy conditions involving either highly toxic gases or organic per-oxides and oxidizers. The need for the automatic smoke |
| 2265 | SBC 201 [501-1000] | 380-440 | `907.2` | `(none)` | no_detectable_heading | do_not_touch | At least one major testing agency, Underwriters Laboratories, Inc. (UL), has a program in which alarm installation and service companies are issued a certificate and become listed by the agency as bei |
| 2266 | SBC 201 [501-1000] | 380-440 | `907.2` | `(none)` | no_detectable_heading | do_not_touch | Fire alarm systems must be installed in accordance with the code and NFPA 72. NFPA 72 identifies the minimum performance, location, mounting, testing and maintenance requirements for fire alarm system |
| 2273 | SBC 201 [501-1000] | 380-440 | `907.6.6` | `907.6.2` | body_heading_differs_from_section_number | split_chunk_candidate | transmitting and receiving equipment that conforms to the special requirements contained in NFPA 72. This requirement is in addition to the general requirements for supervision in Section 907.6.6 . 90 |
| 2274 | SBC 201 [501-1000] | 380-440 | `907.6.4` | `(none)` | no_detectable_heading | split_chunk_candidate | CHAPTER 9—FIRE PROTECTION SYSTEMS SBC 201-CC-2024 911 protection systems or control features, such as smoke control systems. At a minimum, each floor of a building must constitute one zone of the syst |
| 2288 | SBC 201 [501-1000] | 411-435 | `907.2.6` | `(none)` | no_detectable_heading | do_not_touch | CHAPTER 9—FIRE PROTECTION SYSTEMS SBC 201-CC-2024 883 72 is approved by the fire code official and staff evacuation responsibilities are included in the fire safety and evacuation plan required by Sec |
| 2289 | SBC 201 [501-1000] | 411-435 | `903.2.6` | `(none)` | no_detectable_heading | do_not_touch | Exception 1 allows smoke detectors to be eliminated from habitable spaces of Group I-1 Condition 1 occupancies if the building is equipped throughout with an NFPA 13 automatic sprinkler system. The sp |
| 2290 | SBC 201 [501-1000] | 411-435 | `407.2` | `(none)` | no_detectable_heading | do_not_touch | Smoke detection is not required in corridors of Group I-2 Condition 2 occupancies except where otherwise specifically required in the code. Similarly, because areas open to the corridor very often are |
| 2291 | SBC 201 [501-1000] | 411-435 | `907.2.6` | `(none)` | no_detectable_heading | do_not_touch | ❖ Because of the potential for intentional false alarms and the resulting disruption to the facility, manual fire alarm boxes in Group I-3 occupancies may be either locked or made inaccessible to the  |
| 2292 | SBC 201 [501-1000] | 411-435 | `508.4.1` | `(none)` | no_detectable_heading | split_chunk_candidate | The extent of fire alarm application is based on the area in which the Group M occupancy is located. If the building is considered as a separated mixed occupancy, then the fire alarm system is only re |
| 2293 | SBC 201 [501-1000] | 411-435 | `907.2` | `(none)` | no_detectable_heading | split_chunk_candidate | ❖ This section is specific to manual fire alarm systems and requires such systems in all Group R-1 occupancies, with two exceptions. Exception 1 eliminates the requirement for a manual fire alarm syst |
| 2294 | SBC 201 [501-1000] | 411-435 | `907.2.9` | `907.2.9.1` | body_heading_child_of_section_number | split_chunk_candidate | ❖ This section introduces the fire alarm system and smoke alarm requirements for Group R-2 occupancies. This includes Group R-2 occupancies in general and also Group R-2 college and university buildin |
| 2298 | SBC 201 [501-1000] | 411-435 | `907.2.11` | `907.2.11.4` | body_heading_child_of_section_number | split_chunk_candidate | ❖ This requirement is intended to reduce nuisance alarms attributed to locating smoke alarms in close proximity to cooking appliances and bathrooms in which steam is produced. These provisions are bas |
| 2300 | SBC 201 [501-1000] | 411-435 | `907.5.2` | `(none)` | no_detectable_heading | do_not_touch | ❖ Peer-reviewed research has concluded the 520 Hz low frequency is six times more effective than the standard 3 KHz signal at waking high-risk segments of the population (people over 65, people who ar |
| 2301 | SBC 201 [501-1000] | 411-435 | `907.5.2` | `(none)` | no_detectable_heading | split_chunk_candidate | This section also identifies the minimum paging zone arrangement. This does not preclude further zone divisions for logical staged evacuation in accordance with an approved evacuation plan. This secti |
| 2304 | SBC 201 [501-1000] | 421-426 | `907.2.12` | `(none)` | no_detectable_heading | split_chunk_candidate | CHAPTER 9—FIRE PROTECTION SYSTEMS SBC 201-CC-2024 893 approved fire detection device shall automatically do all of the following: 1 Cause illumination of the means of egress with light of not less tha |
| 2309 | SBC 201 [501-1000] | 421-426 | `907.2.18` | `907.2.18.2` | body_heading_child_of_section_number | split_chunk_candidate | The requirement for a smoke detector in the main return and exhaust air plenum of an air- conditioning system in an underground building, however, differs from that of a high- rise building in that it |
| 2312 | SBC 201 [501-1000] | 427-432 | `907.3.2` | `(none)` | no_detectable_heading | split_chunk_candidate | ❖ It is not the intent of this section to send a signal to the fire department or to activate the alarm notification devices within a building. Instead, this section requires that a supervisory signal |
| 2314 | SBC 201 [501-1000] | 427-432 | `907.4.2` | `907.4.2.3` | body_heading_child_of_section_number | split_chunk_candidate | ❖ Manual fire alarm boxes must be reachable by the occupants of the building. They must also be mounted high enough to reduce the likelihood of damage or false alarms from something accidentally strik |
| 2623 | SBC 801 [1001-1200] | 18-20 | `1103.5.3` | `(none)` | no_detectable_heading | split_chunk_candidate | CHAPTER 11—CONSTRUCTION REQUIREMENTS FOR EXISTING BUILDINGS SBC 801-CC-2024 988 difficulties associated with these occupants create the need to incorporate a defend-in- place philosophy of fire protec |
| 2890 | SBC 801 [1201-1400] | 56-64 | `2703.10.4` | `(none)` | no_detectable_heading | split_chunk_candidate | ❖ To prevent contamination of process equipment by sprinkler discharge water that might flow back down the duct, this section requires that the ducts have approved drainage facilities. Prompt drainage |
| 2933 | SBC 801 [1201-1400] | 102-102 | `5003.2.5` | `2903.10` | suspicious_cross_chapter_label | split_chunk_candidate | CHAPTER 29—MANUFACTURE OF ORGANIC COATINGS SBC 801-CC-2024 1272 removed to a detached, outside location and, if not cleaned on the premises, the empty containers shall be removed from the plant as soo |
| 3548 | SBC 801 [1801-2061] | 10-260 | `201.3` | `(none)` | no_detectable_heading | do_not_touch | SBC Saudi Building Codes, Riyadh, Saudi Arabia Standard reference number Title Referenced in code section number SBC 201—24 Saudi Building Code-General 201.3, 202, 304.1.3, 306.1, 311.1.1, 311.3, 313. |

Total fire-alarm / 907.x rows in review: **61**.

## 3. Parent-child rows — DO NOT BLINDLY UPDATE

These rows have a `section_number` that is a parent of the body heading, OR a body heading that is a child sub-clause of the column. Some of these are legitimately tagged at the parent level (the chunk covers multiple sub-clauses including the parent's introductory text). Auto-refining the label to the first detected child sub-clause is mechanically safe in most cases, but spot-check a few first.

Examples (top 25):

| id | file (short) | page | current | detected | type |
|---|---|---|---|---|---|
| 126 | SBC 201 [1-250] | 84-93 | `717.5.4` | `717.5.4.1` | body_heading_child_of_section_number |
| 138 | SBC 201 [1-250] | 94-154 | `907.5.2` | `907.5.2.2` | body_heading_child_of_section_number |
| 303 | SBC 201 [1001-1250] | 27-43 | `1006.2.2` | `1006.2.2.2` | body_heading_child_of_section_number |
| 338 | SBC 201 [1001-1250] | 44-61 | `1006.3` | `1006.3.1` | body_heading_child_of_section_number |
| 385 | SBC 201 [1001-1250] | 64-147 | `1010.3.1` | `1010.3.1.1` | body_heading_child_of_section_number |
| 399 | SBC 201 [1001-1250] | 71-84 | `1010.1.1` | `1010.1.1.1` | body_heading_child_of_section_number |
| 415 | SBC 201 [1001-1250] | 99-100 | `1010.3.1` | `1010.3.1.2` | body_heading_child_of_section_number |
| 439 | SBC 201 [1001-1250] | 116-206 | `1011.14` | `1011.14.2` | body_heading_child_of_section_number |
| 440 | SBC 201 [1001-1250] | 116-206 | `1011.15` | `1011.15.1` | body_heading_child_of_section_number |
| 505 | SBC 201 [1001-1250] | 160-187 | `1030.1.1` | `1030.1.1.1` | body_heading_child_of_section_number |
| 526 | SBC 201 [1001-1250] | 171-174 | `1025.2.4` | `1025.2.4.2` | body_heading_child_of_section_number |
| 538 | SBC 201 [1001-1250] | 190-202 | `1030.6.2` | `1030.6.2.3` | body_heading_child_of_section_number |
| 545 | SBC 201 [1001-1250] | 190-202 | `1030.9.6` | `1030.9.6.1` | body_heading_child_of_section_number |
| 546 | SBC 201 [1001-1250] | 190-202 | `1030.10.2` | `1030.10.2.1` | body_heading_child_of_section_number |
| 547 | SBC 201 [1001-1250] | 190-202 | `1030.11` | `1030.11.2` | body_heading_child_of_section_number |
| 553 | SBC 201 [1001-1250] | 190-202 | `1030.14.2` | `1030.14.2.2` | body_heading_child_of_section_number |
| 554 | SBC 201 [1001-1250] | 190-202 | `1030.14.2` | `1030.14.2.1` | body_heading_child_of_section_number |
| 558 | SBC 201 [1001-1250] | 207-250 | `1031.5` | `1031.5.2` | body_heading_child_of_section_number |
| 583 | SBC 201 [1251-1500] | 68-93 | `1105.1` | `1105.1.7` | body_heading_child_of_section_number |
| 620 | SBC 201 [1251-1500] | 94-102 | `1108.6.2` | `1108.6.2.2` | body_heading_child_of_section_number |
| 626 | SBC 201 [1251-1500] | 94-102 | `1108.7.1` | `1108.7.1.2` | body_heading_child_of_section_number |
| 634 | SBC 201 [1251-1500] | 107-110 | `1109.2.7` | `1109.2.7.2` | body_heading_child_of_section_number |
| 639 | SBC 201 [1251-1500] | 107-110 | `1109.4.2` | `1109.4.2.1` | body_heading_child_of_section_number |
| 647 | SBC 201 [1251-1500] | 111-116 | `1110.2.2` | `1110.2.2.5` | body_heading_child_of_section_number |
| 661 | SBC 201 [1251-1500] | 117-128 | `1110.12.2` | `1110.12.2.2` | body_heading_child_of_section_number |

Total parent-child rows: **360**.

## 4. Chunk-split candidates (multiple distinct section headings in one chunk)

These rows contain TWO or more distinct section-heading markers in the body. A single `section_number` UPDATE cannot be correct — they need an ingestion-time split into multiple chunks, one per real section.

| id | file (short) | page | current | detected_first | distinct_headings_in_body |
|---|---|---|---|---|---|
| 23 | SBC 201 [1-250] | 17-33 | `415.9.3` | `(none)` | 102.4.2, 102.5, 102.6, 102.6.1, 415.9.3 |
| 24 | SBC 201 [1-250] | 17-33 | `105.5` | `102.6.2` | 102.6.2, 103.1 |
| 36 | SBC 201 [1-250] | 34-50 | `104.10` | `104.2` | 104.2, 110.1, 110.2, 110.3 |
| 37 | SBC 201 [1-250] | 34-50 | `110.3.10` | `110.3.1` | 110.3.1, 110.3.2 |
| 39 | SBC 201 [1-250] | 35-53 | `110.3` | `(none)` | 104.7, 104.7.1, 104.8, 104.8.1 |
| 41 | SBC 201 [1-250] | 35-53 | `105.3.1` | `(none)` | 104.11.1, 110.3.10, 110.3.11, 110.3.12, 110.3.13, 110.4 … (+1) |
| 45 | SBC 201 [1-250] | 38-41 | `101.4` | `(none)` | 105.1.1, 105.1.2, 105.2 |
| 47 | SBC 201 [1-250] | 38-41 | `105.1` | `(none)` | 105.2.1, 105.2.2, 105.2.3 |
| 49 | SBC 201 [1-250] | 42-42 | `105.4` | `(none)` | 105.4, 105.5, 105.6, 105.7 |
| 51 | SBC 201 [1-250] | 43-44 | `1607.1` | `106.2` | 106.2, 106.3, 107.1 |
| 54 | SBC 201 [1-250] | 45-46 | `107.2.5` | `(none)` | 107.2.5, 107.2.6, 107.2.7, 107.2.8, 107.3 |
| 55 | SBC 201 [1-250] | 45-46 | `105.3.1` | `107.3.1` | 107.3.1, 107.3.2, 107.3.3 |
| 57 | SBC 201 [1-250] | 47-47 | `107.1` | `(none)` | 107.3.4.1, 107.4, 107.5, 107.1 |
| 59 | SBC 201 [1-250] | 48-48 | `108.2` | `(none)` | 108.2, 108.3, 3103.1.1 |
| 67 | SBC 201 [1-250] | 55-55 | `113.2` | `(none)` | 113.2, 113.3, 113.4, 114.1, 114.2 |
| 72 | SBC 201 [1-250] | 61-61 | `508.4.4` | `(none)` | 201.1, 201.2, 201.3, 201.4 |
| 101 | SBC 201 [1-250] | 73-223 | `1609.2` | `1609.3` | 1609.3, 2510.5, 2303.1.5 |
| 108 | SBC 201 [1-250] | 73-223 | `5003.11` | `(none)` | 309.3, 310.1 |
| 113 | SBC 201 [1-250] | 76-220 | `310.4` | `(none)` | 308.4, 308.4.1 |
| 115 | SBC 201 [1-250] | 76-220 | `308.4.5` | `308.5` | 308.5, 308.5.1 |
| 163 | SBC 201 [1-250] | 103-115 | `1030.1.1` | `(none)` | 1030.1.1, 402.8.2.4, 308.3 |
| 188 | SBC 201 [1-250] | 126-128 | `1703.5` | `(none)` | 1607.1, 1703.5 |
| 198 | SBC 201 [1-250] | 129-147 | `1027.6` | `(none)` | 1027.6, 1905.1.1 |
| 200 | SBC 201 [1-250] | 129-147 | `1010.2.9` | `(none)` | 2306.3, 2303.1.4 |
| 209 | SBC 201 [1-250] | 129-147 | `406.8` | `(none)` | 1105.1.4, 1604.5 |
| 214 | SBC 201 [1-250] | 129-147 | `907.2.11` | `(none)` | 907.2.11, 1613.2.2 |
| 226 | SBC 201 [1-250] | 158-160 | `105.3` | `(none)` | 105.3, 1202.5.1.1 |
| 236 | SBC 201 [1-250] | 196-229 | `303.1.4` | `(none)` | 303.1.4, 303.1.5, 303.2, 303.3 |
| 239 | SBC 201 [1-250] | 196-229 | `303.6` | `(none)` | 303.6, 311.1.1 |
| 240 | SBC 201 [1-250] | 196-229 | `509.1` | `311.1.2` | 311.1.2, 311.2, 311.2.1 |
| 241 | SBC 201 [1-250] | 196-229 | `412.3` | `311.2.2` | 311.2.2, 311.3 |
| 258 | SBC 201 [1-250] | 210-213 | `1207.3` | `(none)` | 307.2, 307.3, 1207.3 |
| 265 | SBC 201 [1-250] | 216-224 | `308.2.1` | `(none)` | 308.2.1, 308.2.2, 308.2.3, 308.2.4, 308.3, 310.5 … (+1) |
| 268 | SBC 201 [1-250] | 217-217 | `308.3` | `(none)` | 308.3.1, 308.3.1.1, 308.3.1.2 |
| 270 | SBC 201 [1-250] | 221-222 | `308.1` | `308.5.2` | 308.5.2, 308.5.2.1, 308.5.3, 308.5.4, 309.1, 308.5 |
| 271 | SBC 201 [1-250] | 221-222 | `309.1` | `(none)` | 309.2, 309.1 |
| 274 | SBC 201 [1-250] | 226-226 | `310.4.2` | `(none)` | 310.4.1, 310.4.2 |
| 275 | SBC 201 [1-250] | 227-227 | `903.3.1` | `310.5` | 310.5, 310.5.1, 310.5.2, 311.1, 310.4 |
| 277 | SBC 201 [1-250] | 230-250 | `311.2` | `(none)` | 311.3.1, 312.1 |
| 285 | SBC 201 [1-250] | 230-250 | `303.2` | `(none)` | 308.4.1.1, 308.4.1.2 |

Total chunk-split candidates: **1677**.

**Recommended handling:** these rows must be excluded from any batched relabel UPDATE. They surface a chunking strategy issue (the upstream JSON ingestion produced chunks that span multiple SBC sections). The fix is at ingestion time — re-emit those chunks with section-aware boundaries — not at the row level. Until that's done, queries can still hit these rows, but their `section_number` column will be approximate.

## 5. Curated table conflict — `sbc_code_tables.table_id='903.2'`

- table_id: `903.2`  source: `SBC 801`  edition: `2024`  md_len: `3156`
- title: `Occupancies Requiring Automatic Sprinkler Systems — SBC 801 Section 903.2 Summary`

### Live `content_md` (head excerpt)

```
## Section 903.2 — Where Required: Automatic Sprinkler Systems by Occupancy
**SBC 801 | Section 903.2 | Chapter 9 — Fire Suppression Systems**

> Note: SBC 801 does not present 903.2 as a single consolidated table — requirements are in sub-sections. This structured summary covers all 903.2.x sub-sections.

| SBC 801 SECTION | OCCUPANCY | SPRINKLER REQUIREMENT TRIGGER |
|---|---|---|
| 903.2.1.1 | A-1 (Theaters, concert halls) | Fire area > 12,000 sq ft (1,115 m²), OR fire area on any floor > 12,000 sq ft, OR building > 1 story, OR occupant load > 300 |
| 903.2.1.2 | A-2 (Restaurants, nightclubs) | Fire area > 5,000 sq ft (465 m²), OR occupant load > 100, OR fire area on any floor below level of exit discharge > 5,000 sq ft |
| 903.2.1.3 | A-3 (Worship, recreation, amusement) | Fire area > 12,000 sq ft (1,115 m²), OR occupant load > 300 |
| 903.2.1.4 | A-4 (Indoor sports arenas) | Fire area > 12,000 sq ft (1,115 m²), OR occupant load > 300 |
| 903.2.2 | E (Educational) | Fire area > 12,000 sq ft (1,115 m²), OR occupied floor below level of exit discharge, OR 12 or more rooms on floor |
| 903.2.3 | F-1 (Moderate hazard manufacturing) | Fire area > 12,000 sq ft (1,115 m²), OR fire are
```

**Internal inconsistency:** this curated row places **Mercantile (Group M) at sub-clause 903.2.6** and **R-1 (Hotels) at sub-clause 903.2.7**. Multiple verbatim chunks in `sbc_documents` (and the curated row's own neighbour rows) place Group M at 903.2.7 — matching SBC 801 / IBC 2021 numbering as published.

**Required action before any chunk relabel:** a maintainer must:
1. Open the source PDF (SBC 801 — The Saudi Fire Protection Code) at the Section 903.2 occupancy table.
2. Confirm whether the published numbering is 903.2.6 → M / 903.2.7 → R-1 (older IBC numbering preserved) or 903.2.7 → M / 903.2.8 → R-1 (matches the verbatim chunks).
3. If the chunks are correct (903.2.7 → M), open a one-row migration to UPDATE the curated `content_md`. Do NOT auto-update.
4. If the curated row is correct (older numbering preserved), then the verbatim chunks themselves are anomalous and the relabel direction reverses. (This is unlikely but must be confirmed.)

Until step 1-2 is signed off, no chunk relabel touching 903.2.x or 907.2.x should be committed.

## 6. Bulk reviewer instructions

Open `reports/advisory-section-canonical-map-review.csv` in a spreadsheet (or `csvkit`). For each row:
- If `recommended_action = safe_auto_candidate`: leave as-is unless body says otherwise. Fill `proposed_section_number = detected_body_heading`, `confidence = high`.
- If `recommended_action = manual_review`: read the snippet. If the body heading is correct, fill `proposed_section_number = detected_body_heading`, `confidence = high`. If the chunk straddles sections, change `recommended_action` to `split_chunk_candidate` and leave `proposed_section_number` blank.
- If `recommended_action = split_chunk_candidate`: leave `proposed_section_number` blank. Add a `reviewer_notes` entry describing where the second section starts (page or chunk_index hint).
- If `recommended_action = do_not_touch`: confirm by leaving `proposed_section_number` blank.

Save the annotated CSV as `reports/advisory-section-canonical-map-review-ANNOTATED.csv` and commit. Step 2.6 will consume that file to produce the actual UPDATE batch script (still not auto-running it — owner approves the SQL diff before execution).

---

Companion: `reports/advisory-section-canonical-map-review.csv`. Earlier dry-run: `reports/advisory-section-drift-summary.md`.