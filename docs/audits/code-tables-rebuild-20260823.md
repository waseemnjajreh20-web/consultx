# SBC code-table rebuild - full ledger of all 93 production rows

Generated 2026-08-24 by `tools/sbc_tables/build.py`. Companion SQL: `code-tables-rebuild-20260823.sql` (the OWNER applies it; this toolchain never writes to the database).

Every row of `public.sbc_code_tables` appears exactly once below. A row is only left alone when the reason is written down.

## 0. DEPLOY ORDER - REQUIRED

**Deploy the updated `fire-safety-chat` Edge Function FIRST, then apply the SQL.**

The rebuild gives 5 tables ids that do not exist in production today: `1006.3.4(1)`, `1020.2`, `1020.2-width`, `509.1`, `705.5`. `fire-safety-chat` hard-codes table ids in `KNOWN_TABLE_IDS` and `PARENT_ALIASES`, both built from the ids production carries now.

Applying the SQL against the currently deployed function would make rebuilt table `1006.3.4(1)` completely unreachable, and would degrade `1020.2`, `705.5` and `509.1` to matching only when the user literally writes the word "Table". The reverse order is harmless: deploying the code first simply means the new ids match nothing until the SQL lands.

| state | rows | meaning |
|---|---|---|
| REBUILT | 16 | transcribed from the printed page; checks (a)(b)(c)(d)(e) all passed |
| NOT-BUILT | 0 | a spec exists but a check failed; nothing is emitted |
| QUARANTINE | 42 | the SBC prints no table with this number; this file renames the row so it stops being injected |
| QUARANTINE (already) | 35 | same finding, but the owner's earlier pass already renamed it; no SQL |
| NOT-ATTEMPTED | 0 | a printed table with this number DOES exist, but no spec was written in this pass |

## 1. Per-row ledger

`page` is a 0-BASED index into the named split PDF; `printed` is the page number the SBC prints in its footer. Re-read any row with `pdfplumber.open(pdf).pages[page]`.

Check (a) provenance re-read - (b) independent cell-by-cell re-extraction - (c) sprinkler inversion - (d) units as printed - (e) the printed page contradicting itself.

| # | production table_id | row id | target | state | PDF | page | printed | caption as printed | (a) | (b) | (c) | (d) | (e) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `QUARANTINED_302` | `2406ec78-e7c2-4f5a-abf3-0fd0bde0e0f4` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 2 | `303` | `c54eccd5-e3cd-47f9-bbd3-029e93b84a3c` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 3 | `304` | `b45622ae-2ecf-481d-8e45-a84950ae959d` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 4 | `305` | `247010e2-d359-442a-9b8b-547d98652479` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 5 | `306` | `ea60aae1-0912-43e4-bf03-5d934e2fc870` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 6 | `307` | `de47f272-f928-4ff3-b685-623d2bba6f46` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 7 | `308` | `ae6dacf8-9cdd-4e3c-82ec-4eb62416c125` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 8 | `309` | `ad5f183d-5455-401b-af3d-c009dcf28b13` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 9 | `310` | `457f4f76-76da-4057-bbf4-91e49f6f8aa0` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 10 | `QUARANTINED_311` | `1f5b6e30-0688-401f-8b00-01ab8df9d19c` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 11 | `QUARANTINED_312` | `19fe9da2-2d1d-4b75-9d2a-788621f00252` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 12 | `QUARANTINED_402` | `75cd7b5b-3430-4e9e-9d91-f08d5d2dcc02` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 13 | `QUARANTINED_403.1` | `be1ddebd-2128-4bbc-8bc7-43d618c7e852` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 14 | `QUARANTINED_404` | `a47f900d-7169-4b44-9eb5-385da064d457` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 15 | `QUARANTINED_405` | `a4a8d7e5-9e69-4844-b177-d3c7e5c94125` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 16 | `QUARANTINED_406.5` | `af1cca93-dcc1-42ca-9256-6fd4cb68beec` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 17 | `QUARANTINED_406.6` | `65331158-5b0c-488f-9890-f38c9a36eaf2` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 18 | `QUARANTINED_407` | `4e8fae38-e254-4f5c-bc45-e72f7e115a63` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 19 | `QUARANTINED_408` | `a26350d5-8f29-4b12-b99c-95fa94fbdc7b` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 20 | `412` | `995dbc83-c79b-4967-b00b-740ba6b6e860` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 21 | `QUARANTINED_412` | `65669361-ad0c-4f60-be2f-a09d33a13f74` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 22 | `412.2` | `dbe2a716-1179-4f7f-b7ed-95e0df916d73` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 23 | `412.5` | `352fbd59-7bd9-4346-8dc8-559dceae97be` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 24 | `QUARANTINED_413` | `8f1e3b42-901f-4038-97ad-79c4337d92eb` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 25 | `414` | `124dd84d-872d-4c2b-a25e-f6c0d0965c35` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 26 | `QUARANTINED_415` | `0eadf344-f35a-492e-8859-3d14c8f4b977` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 27 | `QUARANTINED_416` | `59646d7a-c329-44c4-b25c-cc436bb547f8` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 28 | `417` | `1024a3dc-4f62-4cb4-8cd4-40c98b1c6a9f` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 29 | `417` | `806f1bae-6f80-40cc-96c0-e160be71f059` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 30 | `420` | `a1023e04-1cf4-49f8-94e6-bd64209cf662` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 31 | `504.3` | `03127d3d-4ea8-417b-b3b2-dd8833863b65` | `504.3` | **REBUILT** | `SBC 201 - The Saudi General Building Code-251-500.pdf` | 241 | 464 | `TABLE 504.3 - ALLOWABLE BUILDING HEIGHT IN METERS ABOVE GRADE PLANEa` | PASS | PASS | N/A | PASS | PASS |
| 32 | `504.4` | `ed15da7a-7154-4903-936a-d5d0c674ca30` | `504.4` | **REBUILT** | `SBC 201 - The Saudi General Building Code-251-500.pdf` | 242 | 465 | `TABLE 504.4 - ALLOWABLE NUMBER OF STORIES ABOVE GRADE PLANEa,b` | PASS | PASS | N/A | PASS | PASS |
| 33 | `506.2` | `74ba6a33-3cfc-41f6-8cfe-7dd0a4e80c4d` | `506.2` | **REBUILT** | `SBC 201 - The Saudi General Building Code-251-500.pdf` | [244, 245] | 467 | `TABLE 506.2 a, b - ALLOWABLE AREA FACTOR (A = NS, S1, S13R, OR SM, AS APPLICABL` | PASS | PASS | N/A | PASS | PASS |
| 34 | `508` | `22d00536-02b1-4b6b-b4a8-95d2ead000c0` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 35 | `508.3` | `a2b566d4-2f5e-431e-88e3-5cab3de027ae` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 36 | `508.4` | `1ff010d8-a168-4f92-b698-7f2e3e8c8b26` | `508.4` | **REBUILT** | `SBC 201 - The Saudi General Building Code-251-500.pdf` | 246 | 469 | `TABLE 508.4 - REQUIRED SEPARATION OF OCCUPANCIES (HOURS)f` | PASS | PASS | N/A | PASS | PASS |
| 37 | `508.5` | `a98875f5-b1ff-4c7b-a5bd-661eaa2aacae` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 38 | `QUARANTINED_509` | `24f1239a-3b0c-42bf-a015-94411e42315c` | `509.1` | **REBUILT** | `SBC 201 - The Saudi General Building Code-251-500.pdf` | 247 | 470 | `TABLE 509.1 - INCIDENTAL USES` | PASS | PASS | N/A | PASS | PASS |
| 39 | `QUARANTINED_601` | `e4dc98f4-8030-4ac5-bd8a-a9e708b04a39` | `601` | **REBUILT** | `SBC 201 - The Saudi General Building Code-501-1000.pdf` | 32 | 505 | `TABLE 601 - FIRE-RESISTANCE RATING REQUIREMENTS FOR BUILDING ELEMENTS (H` | PASS | PASS | N/A | PASS | PASS |
| 40 | `QUARANTINED_602` | `745781a8-b58b-4dbb-94f8-91653863cb36` | `705.5` | **REBUILT** | `SBC 201 - The Saudi General Building Code-501-1000.pdf` | 184 | 657 | `TABLE 705.5 - FIRE-RESISTANCE RATING REQUIREMENTS FOR EXTERIOR WALLS BASED` | PASS | PASS | N/A | PASS | PASS |
| 41 | `705.8` | `578fc6bf-d8da-4843-a6af-3550135c77d3` | `705.8` | **REBUILT** | `SBC 201 - The Saudi General Building Code-501-1000.pdf` | 185 | 658 | `TABLE 705.8 - MAXIMUM AREA OF EXTERIOR WALL OPENINGS BASED ON FIRE SEPARAT` | PASS | PASS | N/A | PASS | PASS |
| 42 | `1004.5` | `8b7d0de6-5298-4c99-b638-fd284c5a9b48` | `1004.5` | **REBUILT** | `SBC 201 - The Saudi General Building Code-1001-1250.pdf` | 212 | 1185 | `Table 1004.5 - MAXIMUM FLOOR AREA ALLOWANCES PER OCCUPANT` | PASS | PASS | N/A | PASS | PASS |
| 43 | `QUARANTINED_1005.1` | `7817c5bf-2b50-443f-ab94-b85c5ed8d099` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 44 | `QUARANTINED_1006.2.1` | `5339003f-4f51-4e8c-91f8-def550343af7` | `1006.2.1` | **REBUILT** | `SBC 201 - The Saudi General Building Code-1001-1250.pdf` | 213 | 1186 | `TABLE 1006.2.1 - SPACES WITH ONE EXIT OR EXIT ACCESS DOORWAY` | PASS | PASS | PASS | PASS | PASS |
| 45 | `1006.3.3` | `76cd8e97-b854-4f4c-bc62-e19e3a2fa1bb` | `1006.3.3` | **REBUILT** | `SBC 201 - The Saudi General Building Code-1001-1250.pdf` | 213 | 1186 | `TABLE 1006.3.3 - MINIMUM NUMBER OF EXITS OR ACCESS TO EXITS PER STORY` | PASS | PASS | N/A | PASS | PASS |
| 46 | `QUARANTINED_1006.3.4` | `a6ce9d2c-e38e-4f29-9e53-834b48c18b8b` | `1006.3.4(1)` | **REBUILT** | `SBC 201 - The Saudi General Building Code-1001-1250.pdf` | 213 | 1186 | `TABLE 1006.3.4(1) - STORIES WITH ONE EXIT OR ACCESS TO ONE EXIT FOR R-2 OCCUPANC` | PASS | PASS | N/A | PASS | PASS |
| 47 | `1006.3.4(2)` | `d419009f-e558-4a06-9d98-d5174957156e` | `1006.3.4(2)` | **REBUILT** | `SBC 201 - The Saudi General Building Code-1001-1250.pdf` | 214 | 1187 | `TABLE 1006.3.4(2) - STORIES WITH ONE EXIT OR ACCESS TO ONE EXIT FOR OTHER OCCUPA` | PASS | PASS | N/A | PASS | PASS |
| 48 | `QUARANTINED_1008` | `e9905751-8dd9-49b1-97ce-a022cb0dfdc6` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 49 | `1009` | `a86ba99e-4e9c-4b57-affe-5e57b08ea43b` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 50 | `QUARANTINED_1010` | `6e3928fe-2107-4bcc-a9d9-ac6f4064e202` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 51 | `QUARANTINED_1011.2` | `26a4b906-5f7f-44bc-821e-b1dc7c022129` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 52 | `QUARANTINED_1012` | `38e3797a-843c-48d7-8d41-05193d4411ba` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 53 | `QUARANTINED_1013` | `6dd800be-967a-41d3-9245-89bb38bf6908` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 54 | `1014` | `1c41ee6c-babd-4ce5-8c01-82a9ae1773ef` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 55 | `1014.1` | `b2e43269-bed8-4533-b6be-7209eddc3ec2` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 56 | `1014.2` | `ae165286-e4b0-4821-b4f6-7058bbc41622` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 57 | `1014.3` | `d58e2b7d-71f0-455d-88c7-c1a2c984226a` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 58 | `1014.4` | `338ad2ce-94fc-4346-9a49-77f9c049ebda` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 59 | `1014.5` | `f79da001-978d-4960-8dca-9a3da8d3108d` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 60 | `1014.6` | `74381e94-82fa-4742-8736-04ca3d392b5c` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 61 | `QUARANTINED_1015` | `304228d2-b96c-44d4-a06e-2cf9e6495784` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 62 | `QUARANTINED_1017.2` | `36615928-df1b-42c1-937a-75afc343d3a2` | `1017.2` | **REBUILT** | `SBC 201 - The Saudi General Building Code-1001-1250.pdf` | 215 | 1188 | `TABLE 1017.2 - EXIT ACCESS TRAVEL DISTANCEa` | PASS | PASS | PASS | PASS | PASS |
| 63 | `QUARANTINED_1018.1` | `5f1517df-8853-4bcc-85f4-b89be0b8d350` | `1020.2-width` | **REBUILT** | `SBC 201 - The Saudi General Building Code-1001-1250.pdf` | 216 | 1189 | `TABLE 1020.2 - MINIMUM CORRIDOR WIDTH` | PASS | PASS | N/A | PASS | PASS |
| 64 | `1019` | `90fd087e-1ecd-49bd-ac78-ac4d16e5f7a5` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 65 | `1020.1` | `138da5fc-b9b6-4317-ab3c-d51ea381da8b` | `1020.2` | **REBUILT** | `SBC 201 - The Saudi General Building Code-1001-1250.pdf` | 215 | 1188 | `TABLE 1020.2 - CORRIDOR FIRE-RESISTANCE RATING` | PASS | PASS | PASS | PASS | PASS |
| 66 | `1021.2` | `3995a9dd-59ba-45eb-a355-8a6e0b8c78f6` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 67 | `QUARANTINED_1022` | `9f0b9b23-b733-4ae2-aaf8-05cc54156719` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 68 | `QUARANTINED_1023` | `71730277-3716-471e-b78d-6718ee202574` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 69 | `1024` | `1d79dd64-7a82-4a67-b739-25ea999bd013` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 70 | `QUARANTINED_1029.6.3` | `87b61d55-b221-4e7e-b433-db93d1d76dc2` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 71 | `QUARANTINED_1030` | `2a24ad9e-1042-4e15-a567-d07e92c18bd9` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 72 | `QUARANTINED_903.2` | `f5cd176a-ece2-46a5-a034-5ba8be7f7b82` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 73 | `903.2.7` | `47dc1d22-b6db-47dd-b6fb-b90eb813ef0c` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 74 | `QUARANTINED_903.3.1` | `17f284b0-785a-4c91-8034-c173caf59051` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 75 | `903.3.2` | `4d93758b-e452-4c80-9b08-a6fbe9b8b7a9` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 76 | `903.4` | `8e24391a-c09f-4115-95a0-6ff79d81bffc` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 77 | `903.4.3` | `770a89e0-105b-4449-9bd3-c1396be92d8d` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 78 | `904` | `1b698bc6-a9d6-4239-b6aa-26457318b7d8` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 79 | `QUARANTINED_905.3.1` | `674a3e4f-54bb-4cd1-9422-c432698c6f68` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 80 | `QUARANTINED_907.2` | `ecc95711-1308-4aeb-8d8d-c67a9eda45c0` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 81 | `907.2.7` | `cd1e9986-1db8-4d25-9bc4-894f12d1247a` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 82 | `907.3` | `7f2f8e39-6115-4140-8bb9-eb2ed0b216b7` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 83 | `907.4.2` | `beba7f56-fa48-45eb-a4ff-78c7dbffc97a` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 84 | `907.5` | `a85550c9-e7f1-4a81-90f4-29829d2325b2` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 85 | `907.6` | `31539770-9756-4c04-b913-0d72fd6e4d9c` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 86 | `QUARANTINED_909` | `1d51b60c-1e88-4746-94c5-b5eecac5f392` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 87 | `QUARANTINED_910` | `0b730d92-a1f1-4a70-bac3-aa98f8ff1e7a` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 88 | `911` | `b4362641-4a27-44d2-9804-53d38e73dc77` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 89 | `QUARANTINED_912` | `ca224445-0ad3-4b74-86c3-00a6d8be4cce` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 90 | `QUARANTINED_913` | `a90826a3-a749-421a-b9ae-6dc7f94fcf4c` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |
| 91 | `914` | `ac0a9987-5709-444a-8e13-9e43348640cf` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 92 | `915` | `e124037c-a5b0-49f5-b7ea-ec71f296fb49` | - | **QUARANTINE** | - | - | - | - | - | - | - | - | - |
| 93 | `QUARANTINED_916` | `a18ea678-25ac-4f2f-a5f4-f97a28080d36` | - | **QUARANTINE (already)** | - | - | - | - | - | - | - | - | - |

## 2. Rows not rebuilt, with the concrete reason

None. Every row is either REBUILT or QUARANTINE.

## 3. The 1006.2.1 verdict

Read directly from the printed page: `SBC 201 - The Saudi General Building Code-1001-1250.pdf`, page_index_0based=213, **printed page 1186**, caption `TABLE 1006.2.1`, title `SPACES WITH ONE EXIT OR EXIT ACCESS DOORWAY`.

Columns exactly as printed:

- `OCCUPANCY`
- `MAXIMUM OCCUPANT LOAD`
- `MAXIMUM COMMON PATH OF EGRESS TRAVEL DISTANCE (METER) - WITHOUT SPRINKLER SYSTEM (METER) - OCCUPANT LOAD - OL≤ 30`
- `MAXIMUM COMMON PATH OF EGRESS TRAVEL DISTANCE (METER) - WITHOUT SPRINKLER SYSTEM (METER) - OCCUPANT LOAD - OL > 30`
- `MAXIMUM COMMON PATH OF EGRESS TRAVEL DISTANCE (METER) - WITH SPRINKLER SYSTEM (METER)`

Every printed row, verbatim:

| OCCUPANCY | MAXIMUM OCCUPANT LOAD | MAXIMUM COMMON PATH OF EGRESS TRAVEL DISTANCE (METER) - WITHOUT SPRINKLER SYSTEM (METER) - OCCUPANT LOAD - OL≤ 30 | MAXIMUM COMMON PATH OF EGRESS TRAVEL DISTANCE (METER) - WITHOUT SPRINKLER SYSTEM (METER) - OCCUPANT LOAD - OL > 30 | MAXIMUM COMMON PATH OF EGRESS TRAVEL DISTANCE (METER) - WITH SPRINKLER SYSTEM (METER) |
|---|---|---|---|---|
| Ac, M, U | 49 | 23 | 23 | 23a |
| B | 49 | 30 | 23 | 30a |
| F | 49 | 23 | 23 | 30a |
| H-1, H-2, H-3 | 3 | NP | NP | 7.5b |
| H-4, H-5 | 10 | NP | NP | 23b |
| I-1, I-2d, I-4 | 10 | NP | NP | 23a |
| I-3 | 10 | NP | NP | 30a |
| R-1 | 10 | NP | NP | 23a |
| R-2 | 20 | NP | NP | 38a |
| R-3e | 20 | NP | NP | 38a,g |
| R-4e | 20 | NP | NP | 38a,g |
| Sf | 29 | 30 | 23 | 30a |
| U | 49 | 30 | 23 | 23a |

Footnotes as printed:

- NP = Not Permitted.
- a. Buildings equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1 or 903.3.1.2 . See Section 903 for occupancies where automatic sprinkler systems are permitted in accordance with Section 903.3.1.2 .
- b. Group H occupancies equipped throughout with an automatic sprinkler system in accordance with Section 903.2.5
- c. For a room or space used for assembly purposes having fixed seating, see Section 1030.8 .
- d. For the travel distance limitations in Group I-2, see Section 407.4 .
- e. The common path of egress travel distance shall only apply in a Group R-3 occupancy located in a mixed occupancy building or within a Group R-3 or R-4 congregate living facility.
- f. The length of common path of egress travel distance in a Group S-2 open parking garage shall be not more than 30 meters.
- g. For the travel distance limitations in Group R-3 and R-4 equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.3 , see Section 1006.2.2.6 .

**Verdict.** The inversion is REAL AND PRINTED, not an extraction fault. For Group U the code prints an unsprinklered OL<=30 allowance of 30 m against a sprinklered allowance of 23 m. It is corroborated in a second printed volume: SBC 801 printed page 835 (`SBC 801 - The Saudi Fire Protection Code (3)-801-1000.pdf`, page_index_0based=64) prints the identical Group U row `U | 49 | 30 | 23 | 23 a`. No footnote on either page explains the reduction - footnote `a` only defines what "sprinklered" means.

The row is therefore emitted verbatim under a **per-row, evidence-backed exemption** recorded in `specs.py` and consumed by check (c). The exemption is keyed on (target_id, row label) AND interlocked against the exact printed cells `["U","49","30","23","23a"]`: if re-extraction ever yields anything else the exemption self-voids and the table fails the check. The inversion RULE itself is untouched and no other row is exempt.

Check (c) comparison log for this table - every pair it judged, with the two column headers as printed:

| row | without-sprinkler cell | with-sprinkler cell | verdict |
|---|---|---|---|
| Ac, M, U | 23 | 23a | ok |
| Ac, M, U | 23 | 23a | ok |
| B | 30 | 30a | ok |
| B | 23 | 30a | ok |
| F | 23 | 30a | ok |
| F | 23 | 30a | ok |
| Sf | 30 | 30a | ok |
| Sf | 23 | 30a | ok |
| U | 30 | 23a | INVERTED but EXEMPT (printed) |
| U | 23 | 23a | ok |

A NOTE ON BANDING, because it is the obvious objection: this table bands its without-sprinkler side by occupant load and leaves its with-sprinkler side unbanded. That does NOT make the comparison invalid. An unbanded column governs every band, so 23 m is the sprinklered limit for an OL<=30 Group U space just as much as for an OL>30 one. Skipping banded-against-unbanded comparisons would have suppressed this real finding, so check (c) keeps making them and records the headers instead.

## 3b. Internal-contradiction sweep across every rebuilt table

Check (e) asks a question the other four cannot: does the printed page contradict ITSELF? A row label that appears twice with different values means there is no reading under which both are true. This is a GATE - a detected contradiction blocks emission unless `specs.py` carries an explicit ambiguity note, which `render.py` then ships inside `content_md` so the conflict travels with the table into the prompt.

Two rows count as the same case only when they are identical in every CATEGORICAL column (a column that names the case - occupancy list, sprinkler condition `NS`/`S1`/`SM`, protection condition, construction type) and differ only in what they assert. That is what stops Table 506.2 - which prints each occupancy three times, once per sprinkler condition - from being reported as 83 contradictions.

Sweep result over all 16 rebuilt tables:

| target | contradictions found | covered by an ambiguity note? |
|---|---|---|
| `504.3` | none | - |
| `504.4` | none | - |
| `506.2` | none | - |
| `508.4` | none | - |
| `509.1` | none | - |
| `601` | row label `Floor construction and associated secondary structural members (see Section 202)` printed twice with differing values | yes |
| `705.5` | none | - |
| `705.8` | none | - |
| `1004.5` | none | - |
| `1006.2.1` | row label `U` printed twice with differing values | yes |
| `1006.3.3` | none | - |
| `1006.3.4(1)` | none | - |
| `1006.3.4(2)` | none | - |
| `1017.2` | row label `I-1` printed twice with differing values | yes |
| `1020.2-width` | none | - |
| `1020.2` | none | - |

**Three contradictions across the 16 tables, all three covered by an ambiguity note that ships inside `content_md`:**

| table | duplicated label | conflict | how it surfaced |
|---|---|---|---|
| `1006.2.1` | Group `U` | 23 m vs 30 m unsprinklered | found while adjudicating the check (c) inversion |
| `1017.2` | Group `I-1` | 60 m vs `Not permitted` unsprinklered | **found by this sweep** |
| `601` | `Floor construction and associated secondary structural members` | two different rating rows | **found by this sweep** |

The `1017.2` and `601` hits are the reason the sweep exists: both were invisible to checks (a) through (d), and a one-off fix to either without sweeping the rest would have left the class open. No table has a duplicated column header.

TABLE 601 is printed ONCE only, at SBC 201 printed page 505 (`SBC 201 - The Saudi General Building Code-501-1000.pdf`, page_index_0based=32). SBC 801 does NOT print a TABLE 601 - it only cross-references "Table 601 of SBC 201" at its printed page 981. So unlike TABLE 1006.2.1 (corroborated by SBC 801 page 835) and the TABLE 1020.2 collision (resolved by SBC 801 page 839), **no second printing exists that could settle this one**. It needs the authority having jurisdiction.

What the duplicated row prints:

| row | as printed |
|---|---|
| first (y-top 262.7) | `2 \| 2 \| 1 \| 0 \| 1 \| 0 \| 2 \| 2 \| 2 \| HT \| 1 \| 0` |
| second (y-top 297.5) | `b \| 1b, c \| 1b, c \| 0c \| 1b, c \| 0 \| 1 \| 1 \| 1 \| HT \| 1b, c \| 0` |

The word "Roof" does not appear as a row label anywhere in TABLE 601 - it occurs only in the footnotes - so the table as printed states no roof-construction requirement at all. Whether the second row was meant to read "Roof construction" is **UNKNOWN** and is deliberately not inferred. The shipped ambiguity note states that the HIGHER rating in each column governs pending clarification, a rating being a requirement.

## 4. Imperial-unit census (measured, not inherited)

The SBC prints in metric. Any imperial token in `content_md` that is not printed on the cited source page is a defect. Measured over the production dump with the same token list check (d) uses (`ft`, `feet`, `foot`, `inch`, `inches`, `in.`, `psi`, `gpm`, `degrees F`).

- rows carrying at least one imperial token: **49 of 93**
- of those, still ACTIVE (not quarantined, i.e. still injected today): **7**

| production table_id | row id | chapter | tokens | title |
|---|---|---|---|---|
| `308` | `ae6dacf8-9cdd-4e3c-82ec-4eb62416c125` | 3 | `ft` | Institutional Occupancy Group I — Sub-Classification I-1 Thr |
| `414` | `124dd84d-872d-4c2b-a25e-f6c0d0965c35` | 4 | `ft` | Hazardous Materials — Control Areas, MAQ Thresholds, and Sto |
| `417` | `1024a3dc-4f62-4cb4-8cd4-40c98b1c6a9f` | 4 | `degrees F` | Drying Rooms — Construction, Sprinkler Protection, Ventilati |
| `508.4` | `1ff010d8-a168-4f92-b698-7f2e3e8c8b26` | 5 | `ft` | Nonseparated Occupancies — Most-Restrictive Occupancy Rule |
| `705.8` | `578fc6bf-d8da-4843-a6af-3550135c77d3` | 7 | `ft` | Maximum Area of Exterior Wall Openings Based on Fire Separat |
| `907.3` | `7f2f8e39-6115-4140-8bb9-eb2ed0b216b7` | 9 | `degrees F` | Fire Alarm Initiating Devices — Smoke Detectors, Heat Detect |
| `911` | `b4362641-4a27-44d2-9804-53d38e73dc77` | 9 | `degrees F` | Commercial Cooking Hood Suppression Systems — Where Required |

Full list including already-quarantined rows:

| production table_id | quarantined? | tokens |
|---|---|---|
| `QUARANTINED_302` | yes | `ft` |
| `308` | **NO** | `ft` |
| `QUARANTINED_311` | yes | `ft` |
| `QUARANTINED_312` | yes | `ft` |
| `QUARANTINED_402` | yes | `ft` |
| `QUARANTINED_403.1` | yes | `ft`, `feet` |
| `QUARANTINED_404` | yes | `ft` |
| `QUARANTINED_405` | yes | `ft` |
| `QUARANTINED_406.5` | yes | `ft`, `inches` |
| `QUARANTINED_406.6` | yes | `ft` |
| `QUARANTINED_407` | yes | `ft`, `inches` |
| `QUARANTINED_408` | yes | `ft` |
| `QUARANTINED_412` | yes | `ft`, `gpm` |
| `QUARANTINED_413` | yes | `ft`, `feet`, `inch` |
| `414` | **NO** | `ft` |
| `QUARANTINED_415` | yes | `ft` |
| `QUARANTINED_416` | yes | `ft` |
| `417` | **NO** | `degrees F` |
| `508.4` | **NO** | `ft` |
| `QUARANTINED_509` | yes | `ft`, `psi` |
| `QUARANTINED_601` | yes | `ft`, `feet` |
| `QUARANTINED_602` | yes | `ft` |
| `705.8` | **NO** | `ft` |
| `QUARANTINED_1005.1` | yes | `inches`, `inch` |
| `QUARANTINED_1006.2.1` | yes | `ft` |
| `QUARANTINED_1006.3.4` | yes | `ft` |
| `QUARANTINED_1008` | yes | `foot` |
| `QUARANTINED_1010` | yes | `ft` |
| `QUARANTINED_1011.2` | yes | `ft`, `inches`, `inch` |
| `QUARANTINED_1012` | yes | `ft` |
| `QUARANTINED_1013` | yes | `ft`, `foot` |
| `QUARANTINED_1015` | yes | `ft`, `inches`, `inch` |
| `QUARANTINED_1017.2` | yes | `ft`, `feet` |
| `QUARANTINED_1018.1` | yes | `inches` |
| `QUARANTINED_1022` | yes | `inches` |
| `QUARANTINED_1023` | yes | `ft` |
| `QUARANTINED_1029.6.3` | yes | `inches`, `inch` |
| `QUARANTINED_1030` | yes | `ft` |
| `QUARANTINED_903.2` | yes | `ft`, `feet` |
| `QUARANTINED_903.3.1` | yes | `ft` |
| `QUARANTINED_905.3.1` | yes | `ft` |
| `QUARANTINED_907.2` | yes | `ft` |
| `907.3` | **NO** | `degrees F` |
| `QUARANTINED_909` | yes | `ft` |
| `QUARANTINED_910` | yes | `ft`, `degrees F` |
| `911` | **NO** | `degrees F` |
| `QUARANTINED_912` | yes | `ft` |
| `QUARANTINED_913` | yes | `inches`, `psi`, `gpm` |
| `QUARANTINED_916` | yes | `ft`, `inches` |

## 5. Evidence of absence for the quarantined rows

A row is only quarantined for "no printed table" when the chapter's own collection block has been read and does not list the number. The blocks below are what the SBC actually prints.

### SBC 201, chapter 3

Rows with no printed table: `302`, `303`, `304`, `305`, `306`, `307`, `308`, `309`, `310`, `311`, `312`

- block in `SBC 201 - The Saudi General Building Code-1-250.pdf` idx 232..249
  - captions it actually lists: `307.1(1)`, `307.1(2)`
- block in `SBC 801 - The Saudi Fire Protection Code (3)-201-400.pdf` idx 85..91
  - captions it actually lists: `315.7.6(1)`, `315.7.6(2)`, `315.7.6(3)`, `315.7.6(4)`

### SBC 201, chapter 4

Rows with no printed table: `402`, `403.1`, `404`, `405`, `406.5`, `406.6`, `407`, `408`, `412`, `412.2`, `412.5`, `413`, `414`, `415`, `416`, `417`, `420`

- block in `SBC 201 - The Saudi General Building Code-251-500.pdf` idx 155..189
  - captions it actually lists: `403.2.4`, `406.5.4`, `412.2.1.1`, `412.3.6`, `412.6`, `414.2.2`, `414.2.5(1)`, `414.2.5(2)`, `414.5.1`, `415.6.5`, `415.11.1.1.1`, `428.3`
- block in `SBC 801 - The Saudi Fire Protection Code (3)-201-400.pdf` idx 126..128
  - captions it actually lists: `405.3`

### SBC 201, chapter 5

Rows with no printed table: `508`, `508.3`, `508.5`

- block in `SBC 201 - The Saudi General Building Code-251-500.pdf` idx 241..249; `SBC 201 - The Saudi General Building Code-501-1000.pdf` idx 0..13
  - captions it actually lists: `504.3`, `504.4`, `506.2`, `506.3.3`, `506.3.3.1`, `508.4`, `509.1`

### SBC 201, chapter 10

Rows with no printed table: `1005.1`, `1008`, `1009`, `1010`, `1011.2`, `1012`, `1013`, `1014`, `1014.1`, `1014.2`, `1014.3`, `1014.4`, `1014.5`, `1014.6`, `1015`, `1019`, `1021.2`, `1022`, `1023`, `1024`, `1029.6.3`, `1030`

- block in `SBC 201 - The Saudi General Building Code-1001-1250.pdf` idx 212..249; `SBC 201 - The Saudi General Building Code-1251-1500.pdf` idx 0..63
  - captions it actually lists: `1004.5`, `1006.2.1`, `1006.3.3`, `1006.3.4(1)`, `1006.3.4(2)`, `1010.3.1(1)`, `1010.3.1(2)`, `1017.2`, `1020.2`, `1030.6.2`, `1030.13.2.1`
- block in `SBC 801 - The Saudi Fire Protection Code (3)-801-1000.pdf` idx 63..178
  - captions it actually lists: `1004.5`, `1006.2.1`, `1006.3.3`, `1006.3.4(1)`, `1006.3.4(2)`, `1010.3.1(1)`, `1010.3.1(2)`, `1017.2`, `1020.2`, `1020.3`, `1030.6.2`, `1029.12.2.1`

### SBC 801, chapter 9

Rows with no printed table: `903.2`, `903.2.7`, `903.3.1`, `903.3.2`, `903.4`, `903.4.3`, `904`, `905.3.1`, `907.2`, `907.2.7`, `907.3`, `907.4.2`, `907.5`, `907.6`, `909`, `910`, `911`, `912`, `913`, `914`, `915`, `916`

- block in `SBC 201 - The Saudi General Building Code-501-1000.pdf` idx 497..499; `SBC 201 - The Saudi General Building Code-1001-1250.pdf` idx 0..22
  - captions it actually lists: `903.2.5.2`, `903.2.11.6`, `906.1`, `906.3(1)`, `906.3(2)`, `907.5.2.3.2`
- block in `SBC 801 - The Saudi Fire Protection Code (3)-601-800.pdf` idx 38..67
  - captions it actually lists: `901.6.1`, `903.2.5.2`, `903.2.11.6`, `3206.2`, `906.1`, `906.3(1)`, `906.3(2)`, `907.5.2.3.2`, `911.1`, `914.8.3`, `1017.2`, `508.4`, `1020.1`, `705.8`, `803.9`

## 6. What the owner must decide

### 6.1 Two different tables are both printed as TABLE 1020.2 (SBC 201)

CONFIRMED against the PDF: pdfplumber finds a caption `TABLE 1020.2` at y=525.15 on page_index_0based 215 (printed page 1188, CORRIDOR FIRE-RESISTANCE RATING) and again at y=75.29 on page_index_0based 216 (printed page 1189, MINIMUM CORRIDOR WIDTH). The collision is in the printed SBC 201 itself.

**SBC 801 resolves it.** Printed page 839 (`SBC 801 - The Saudi Fire Protection Code (3)-801-1000.pdf`, page_index_0based=68) prints `TABLE 1020.2 CORRIDOR FIRE-RESISTANCE RATING` and `TABLE 1020.3 MINIMUM CORRIDOR WIDTH` as two separately numbered tables.

Recommendation: give the corridor-width row the number **1020.3**, per SBC 801. Until that is approved it carries the synthetic id `1020.2-width`, which `extractTableIds()` will not match - the content is repaired but the row stays un-injected rather than colliding.

Note the safety-alert claim is confirmed by this rebuild: the printed minimum corridor width for facilities not otherwise listed is **1100 mm**, not the 914 mm production carried.

### 6.2 TABLE 508.4 subject mismatch

The printed `TABLE 508.4` is REQUIRED SEPARATION OF OCCUPANCIES (HOURS); the production row titled `508.4` is "Nonseparated Occupancies - Most-Restrictive Occupancy Rule". The rebuild replaces the row with the printed separation table, so the row's SUBJECT changes. Confirm that is wanted, or split it into two rows.

### 6.3 The two printed volumes disagree with each other on TABLE 1006.2.1

CONFIRMED by reading both pages. SBC 201 printed page 1186 versus SBC 801 printed page 835:

| | SBC 201 p.1186 | SBC 801 p.835 |
|---|---|---|
| first row occupancies | `Ac, M, U` | `Ac, E, M` |
| R-2 / R-3 / R-4 max occupant load | 20 | 10 |
| R-4e without sprinkler | `NP` / `NP` | `23` / `23` |

SBC 201 lists Group U twice and never lists Group E, which looks like a misprint in SBC 201 - but that is an inference, NOT a finding, and the rebuild transcribes SBC 201 as printed because the row is tagged `SBC 201`. The owner should decide which volume governs.

### 6.4 `table_id` is not an identity

`table_id` is neither unique (`417` is two distinct rows) nor stable (the owner's quarantine passes rewrite it in place). Everything in this toolchain keys on the uuid primary key instead. Any future script that keys on `table_id` will silently stop matching rows after a quarantine pass.

### 6.5 Most production rows are not tables at all

Only 13 of the 93 production numbers are printed as a table caption anywhere in either code. The rest are numbered after code SECTIONS (for example `1014.1` "Handrails: Where Required", `907.5`, `903.4.3`) and are editorial summaries, not transcriptions. They cannot be verified cell by cell against the code, yet they are injected under a header that tells the model to cite them verbatim as authoritative. That mismatch - not any single wrong number - is the systemic defect.

