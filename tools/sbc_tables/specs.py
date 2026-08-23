"""Registry: which printed SBC table (if any) backs each production row.

Every entry was established by (1) enumerating the "TABLES AND FIGURES OF
CHAPTER n" blocks that the SBC uses to collect its printed tables, and
(2) reading the caption and printed title on the page. Nothing here is inferred
from the IBC or from the production content.

Fields
------
row_id        production sbc_code_tables.id (the PK - table_id is NOT unique)
table_id      production table_id as it stands today (may carry QUARANTINED_)
target_id     the table_id the row should carry after the rebuild
status        'match'      target_id == printed caption number
              'renumbered' the row is a real SBC table printed under a DIFFERENT
                           number; target_id is the SBC number
pdf           split PDF basename
page          0-BASED page index into that split PDF
number        the caption number as printed on the page
occurrence    which occurrence of that caption on the page (0 unless the SBC
              prints the same number twice on one page)
pages         optional list of 0-based page indices when the SBC prints the table
              across consecutive pages, each repeating the caption. Defaults to
              [page].
polarity      'allowance'   larger permitted value  == less strict (distances,
                            areas, heights, occupant loads)
              'requirement' larger required value   == more strict (hours of
                            fire-resistance rating, number of exits)
              None          no with/without-sprinkler pair -> check (c) is N/A
note          why this mapping is what it is; surfaced in the report and the SQL
"""
from __future__ import annotations

V201_251 = "SBC 201 - The Saudi General Building Code-251-500.pdf"
V201_501 = "SBC 201 - The Saudi General Building Code-501-1000.pdf"
V201_1001 = "SBC 201 - The Saudi General Building Code-1001-1250.pdf"

SPECS = [
    # ---------------- Chapter 10, Means of Egress -------------------------
    dict(row_id="8b7d0de6-5298-4c99-b638-fd284c5a9b48", table_id="1004.5",
         target_id="1004.5", status="match", pdf=V201_1001, page=212,
         number="1004.5", occurrence=0, polarity=None,
         note="CALIBRATION TABLE. Caption printed as 'Table 1004.5'."),
    dict(row_id="5339003f-4f51-4e8c-91f8-def550343af7",
         table_id="QUARANTINED_1006.2.1",
         target_id="1006.2.1", status="match", pdf=V201_1001, page=213,
         number="1006.2.1", occurrence=0, polarity="allowance",
         note="Three distance columns (OL<=30 / OL>30 without sprinkler, and "
              "with sprinkler). The production row had collapsed them into one.",
         ambiguities=[
             dict(
                 what="Group U is printed in TWO different rows of this table "
                      "with CONFLICTING unsprinklered limits. Row 1, printed "
                      "'A(c), M, U', gives a maximum common path of egress "
                      "travel of 23 m for occupant load <= 30 without "
                      "sprinklers. Row 13, printed 'U', gives 30 m for the same "
                      "condition. A Group U space therefore has two different "
                      "printed limits.",
                 conservative="23 m",
                 corroboration="Cross-volume note, CONFIRMED by reading both "
                               "pages: SBC 801 printed page 835 prints this "
                               "same table with its first row as 'A(c), E, M' "
                               "rather than 'A(c), M, U', and prints no Group U "
                               "in that row at all. Which volume governs is an "
                               "owner / authority question; neither reading is "
                               "asserted here as correct.",
             ),
         ],
         inversion_exemptions=[
             dict(
                 target_id="1006.2.1",
                 row="U",
                 # The row EXACTLY as printed. The exemption is void if the
                 # extraction ever produces anything else - see
                 # checks._exemption_for().
                 cells=["U", "49", "30", "23", "23a"],
                 printed_page=1186,
                 pdf=V201_1001,
                 page_index_0based=213,
                 footnote="a. Buildings equipped throughout with an automatic "
                          "sprinkler system in accordance with Section 903.3.1.1 "
                          "or 903.3.1.2 . See Section 903 for occupancies where "
                          "automatic sprinkler systems are permitted in "
                          "accordance with Section 903.3.1.2 .",
                 why="READ FROM THE PRINTED PAGE, not inferred. SBC 201 printed "
                     "page 1186 prints, for Group U: maximum occupant load 49; "
                     "WITHOUT SPRINKLER SYSTEM (METER) OL<= 30 = 30; OL > 30 = "
                     "23; WITH SPRINKLER SYSTEM (METER) = 23a. The sprinklered "
                     "allowance (23) is therefore smaller than the unsprinklered "
                     "OL<=30 allowance (30). CORROBORATED IN A SECOND PRINTED "
                     "VOLUME: SBC 801 printed page 835 (page_index_0based=64 of "
                     "the 801-1000 split) prints the identical Group U row "
                     "'U | 49 | 30 | 23 | 23 a', so this is not a single-volume "
                     "misprint. No footnote on either page explains the "
                     "reduction; footnote 'a' only defines what 'sprinklered' "
                     "means. The value is reproduced because it is what the code "
                     "prints; whether the code itself is in error is an SBC "
                     "erratum question and is escalated to the owner, not "
                     "silently corrected here."),
         ]),
    dict(row_id="76cd8e97-b854-4f4c-bc62-e19e3a2fa1bb", table_id="1006.3.3",
         target_id="1006.3.3", status="match", pdf=V201_1001, page=213,
         number="1006.3.3", occurrence=0, polarity=None,
         note="CALIBRATION TABLE."),
    dict(row_id="a6ce9d2c-e38e-4f29-9e53-834b48c18b8b", table_id="QUARANTINED_1006.3.4",
         target_id="1006.3.4(1)", status="renumbered", pdf=V201_1001, page=213,
         number="1006.3.4(1)", occurrence=0, polarity=None,
         note="SBC prints no bare 'TABLE 1006.3.4'; it prints 1006.3.4(1) for "
              "Group R-2 and 1006.3.4(2) for other occupancies. The production "
              "row's title matches the R-2 table."),
    dict(row_id="d419009f-e558-4a06-9d98-d5174957156e", table_id="1006.3.4(2)",
         target_id="1006.3.4(2)", status="match", pdf=V201_1001, page=214,
         number="1006.3.4(2)", occurrence=0, polarity=None,
         note=""),
    dict(row_id="36615928-df1b-42c1-937a-75afc343d3a2", table_id="QUARANTINED_1017.2",
         target_id="1017.2", status="match", pdf=V201_1001, page=215,
         number="1017.2", occurrence=0, polarity="allowance",
         note="The table at the centre of the safety alert.",
         ambiguities=[
             dict(
                 what="Group I-1 is printed in TWO different rows of this table "
                      "with CONFLICTING unsprinklered limits. Row 1, printed "
                      "'A, E, F-1, I-1, M, R, S-1', gives a maximum exit access "
                      "travel distance of 60 m without a sprinkler system. Row "
                      "2, printed 'I-1' on its own, gives 'Not permitted' "
                      "without a sprinkler system. A Group I-1 building "
                      "therefore has two different printed answers to the same "
                      "question. Both rows give 75 m with sprinklers, so the "
                      "conflict is confined to the unsprinklered column.",
                 conservative="Not permitted - i.e. an unsprinklered Group I-1 "
                              "exit access is treated as not allowed",
                 corroboration="Read from SBC 201 printed page 1188 "
                               "(page_index_0based 215). The same two-row "
                               "pattern is printed in SBC 801 printed page 838.",
             ),
         ]),
    dict(row_id="138da5fc-b9b6-4317-ab3c-d51ea381da8b", table_id="1020.1",
         target_id="1020.2", status="renumbered", pdf=V201_1001, page=215,
         number="1020.2", occurrence=0, polarity="requirement",
         note="RENUMBERED 1020.1 -> 1020.2. SBC prints the corridor "
              "fire-resistance table as TABLE 1020.2; there is no TABLE 1020.1 "
              "in SBC 201. Hours of rating: a LARGER value is MORE strict."),
    dict(row_id="5f1517df-8853-4bcc-85f4-b89be0b8d350", table_id="QUARANTINED_1018.1",
         target_id="1020.2-width", status="renumbered", pdf=V201_1001, page=216,
         number="1020.2", occurrence=0, polarity=None,
         note="RENUMBERED 1018.1 -> MINIMUM CORRIDOR WIDTH. SBC 201 prints TWO "
              "different tables both numbered TABLE 1020.2: corridor "
              "fire-resistance rating on printed page 1188 (page_index_0based "
              "215) and minimum corridor width on printed page 1189 "
              "(page_index_0based 216). Verified: pdfplumber reports a caption "
              "'TABLE 1020.2' at top=525.15 on index 215 and again at top=75.29 "
              "on index 216. The collision is in the printed SBC 201 itself. "
              "SBC 801 DOES disambiguate: printed page 839 (801-1000 split, "
              "page_index_0based 68) prints 'TABLE 1020.2 CORRIDOR "
              "FIRE-RESISTANCE RATING' and 'TABLE 1020.3 MINIMUM CORRIDOR WIDTH' "
              "as two separately numbered tables. RECOMMENDATION for the owner: "
              "adopt 1020.3 for this row, per SBC 801. Until the owner decides, "
              "target_id stays the synthetic '1020.2-width', which "
              "extractTableIds() will NOT match - so the row is repaired in "
              "place but remains un-injected rather than colliding with the "
              "fire-resistance table."),

    # ---------------- Chapter 5, Heights and Areas ------------------------
    dict(row_id="03127d3d-4ea8-417b-b3b2-dd8833863b65", table_id="504.3",
         target_id="504.3", status="match", pdf=V201_251, page=241,
         number="504.3", occurrence=0, polarity="allowance", note=""),
    dict(row_id="ed15da7a-7154-4903-936a-d5d0c674ca30", table_id="504.4",
         target_id="504.4", status="match", pdf=V201_251, page=242,
         number="504.4", occurrence=0, polarity="allowance", note=""),
    dict(row_id="74ba6a33-3cfc-41f6-8cfe-7dd0a4e80c4d", table_id="506.2",
         target_id="506.2", status="match", pdf=V201_251, page=244,
         number="506.2", occurrence=0, polarity="allowance", pages=[244, 245],
         note="Spans printed pages 467 and 468 (page indices 244 and 245); the "
              "SBC repeats the caption on the continuation page."),
    dict(row_id="1ff010d8-a168-4f92-b698-7f2e3e8c8b26", table_id="508.4",
         target_id="508.4", status="match", pdf=V201_251, page=246,
         number="508.4", occurrence=0, polarity="requirement",
         note="SUBJECT MISMATCH: printed TABLE 508.4 is 'REQUIRED SEPARATION OF "
              "OCCUPANCIES (HOURS)', while the production row 508.4 is titled "
              "'Nonseparated Occupancies'. Owner decision required."),
    dict(row_id="24f1239a-3b0c-42bf-a015-94411e42315c", table_id="QUARANTINED_509",
         target_id="509.1", status="renumbered", pdf=V201_251, page=247,
         number="509.1", occurrence=0, polarity="requirement",
         note="RENUMBERED 509 -> 509.1. SBC prints TABLE 509.1 INCIDENTAL USES."),

    # ---------------- Chapters 6 and 7, Fire resistance -------------------
    dict(row_id="e4dc98f4-8030-4ac5-bd8a-a9e708b04a39", table_id="601",
         target_id="601", status="match", pdf=V201_501, page=32,
         number="601", occurrence=0, polarity="requirement",
         note="Printed ONCE only, in SBC 201 printed page 505. SBC 801 does not "
              "print a TABLE 601; it only cross-references 'Table 601 of SBC "
              "201' (SBC 801 printed page 981). So unlike TABLE 1006.2.1 and "
              "the TABLE 1020.2 collision, there is no second printing that "
              "could resolve the duplicated row label below.",
         ambiguities=[
             dict(
                 what="The row label 'Floor construction and associated "
                      "secondary structural members (see Section 202)' is "
                      "printed TWICE in this table, at y-top 262.7 and again at "
                      "y-top 297.5 of the page, with DIFFERENT required "
                      "fire-resistance ratings. The first prints "
                      "'2 | 2 | 1 | 0 | 1 | 0 | 2 | 2 | 2 | HT | 1 | 0'; the "
                      "second prints "
                      "'b | 1b, c | 1b, c | 0c | 1b, c | 0 | 1 | 1 | 1 | HT | "
                      "1b, c | 0'. There is no categorical column separating "
                      "the two rows, so there is no reading of the printed page "
                      "under which both are simultaneously true for the same "
                      "construction type. Note also that the word 'Roof' does "
                      "not appear as a row label anywhere in this table - it "
                      "occurs only in the footnotes - so the table as printed "
                      "states no roof-construction requirement at all.",
                 conservative="the HIGHER rating in each column - a "
                              "fire-resistance rating is a requirement, so the "
                              "larger number is the stricter one (for example 2 "
                              "hours rather than 1 hour for Types I-A and I-B)",
                 corroboration="What the second row was intended to say is "
                               "UNKNOWN and is NOT inferred here. TABLE 601 is "
                               "printed only once in the whole corpus (SBC 201 "
                               "printed page 505), so no second printing is "
                               "available to settle it. This needs the "
                               "authority having jurisdiction.",
             ),
         ]),
    dict(row_id="745781a8-b58b-4dbb-94f8-91653863cb36", table_id="602",
         target_id="705.5", status="renumbered", pdf=V201_501, page=184,
         number="705.5", occurrence=0, polarity="requirement",
         note="RENUMBERED 602 -> 705.5. SBC 201 prints no TABLE 602. The table "
              "titled 'FIRE-RESISTANCE RATING REQUIREMENTS FOR EXTERIOR WALLS "
              "BASED ON FIRE SEPARATION DISTANCE' - which is what the production "
              "row is titled - is printed as TABLE 705.5."),
    dict(row_id="578fc6bf-d8da-4843-a6af-3550135c77d3", table_id="705.8",
         target_id="705.8", status="match", pdf=V201_501, page=185,
         number="705.8", occurrence=0, polarity="allowance", note=""),
]


def by_row_id():
    return {s["row_id"]: s for s in SPECS}
