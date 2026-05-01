# SBC 201 — Round 2 manual_review resolution

- audited_at: 2026-05-01T12:22:42.644363+00:00
- code_family: SBC 201
- round: 2
- manual_review_total: 23
- resolved (targeted_extract): 14
- quarantined: 9
- manual_review_keep: 0

## Rules
- wider page sweep: +/- 60
- min chars: 200
- max non-letter ratio: 0.3
- section glyph banned in any output (hard stop)

## Entries

| id | action | reason / notes | output |
|----|--------|----------------|--------|
| sbc-201-section-102 | targeted_extract | quality_fail:too_short:51 | sbc-201-section-102.md |
| sbc-201-section-104 | targeted_extract | quality_fail:fragmented:short_line_ratio=0.63 | sbc-201-section-104.md |
| sbc-201-section-109 | targeted_extract | quality_fail:non_letter_ratio:0.83 | sbc-201-section-109.md |
| sbc-201-section-110 | targeted_extract | quality_fail:non_letter_ratio:0.83 | sbc-201-section-110.md |
| sbc-201-section-111 | targeted_extract | quality_fail:non_letter_ratio:0.85 | sbc-201-section-111.md |
| sbc-201-section-112 | targeted_extract | quality_fail:non_letter_ratio:0.82 | sbc-201-section-112.md |
| sbc-201-section-113 | targeted_extract | quality_fail:non_letter_ratio:0.82 | sbc-201-section-113.md |
| sbc-201-section-114 | targeted_extract | quality_fail:non_letter_ratio:0.83 | sbc-201-section-114.md |
| sbc-201-section-115 | targeted_extract | quality_fail:non_letter_ratio:0.84 | sbc-201-section-115.md |
| sbc-201-section-116 | targeted_extract | quality_fail:non_letter_ratio:0.84 | sbc-201-section-116.md |
| sbc-201-section-202 | targeted_extract | section_marker_not_found_at_proposed_page; likely printed-page vs PDF-page misalignment | sbc-201-section-202.md |
| sbc-201-section-309 | targeted_extract | quality_fail:too_short:94 | sbc-201-section-309.md |
| sbc-201-section-401 | targeted_extract | section_marker_not_found_at_proposed_page; likely printed-page vs PDF-page misalignment | sbc-201-section-401.md |
| sbc-201-section-402 | targeted_extract | section_marker_not_found_at_proposed_page; likely printed-page vs PDF-page misalignment | sbc-201-section-402.md |
| sbc-201-section-203 | quarantine | no_pdf_or_unknown_range; absent from SBC 201 2024 corpus per ledger |  |
| sbc-201-section-204 | quarantine | no_pdf_or_unknown_range; absent from SBC 201 2024 corpus per ledger |  |
| sbc-201-section-205 | quarantine | no_pdf_or_unknown_range; absent from SBC 201 2024 corpus per ledger |  |
| sbc-201-section-206 | quarantine | no_pdf_or_unknown_range; absent from SBC 201 2024 corpus per ledger |  |
| sbc-201-section-207 | quarantine | no_pdf_or_unknown_range; absent from SBC 201 2024 corpus per ledger |  |
| sbc-201-section-429 | quarantine | no_pdf_or_unknown_range; absent from SBC 201 2024 corpus per ledger |  |
| sbc-201-section-918 | quarantine | no_pdf_or_unknown_range; absent from SBC 201 2024 corpus per ledger |  |
| sbc-201-section-801 | quarantine | no_pdf_or_unknown_range; absent from SBC 201 2024 corpus per ledger |  |
| sbc-201-section-807 | quarantine | no_pdf_or_unknown_range; absent from SBC 201 2024 corpus per ledger |  |
