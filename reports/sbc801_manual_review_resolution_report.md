# SBC 801 Manual Review Resolution Report (Round 2)

- Agent: Sub-Agent B2 (round 2)
- Generated UTC: 2026-05-01T12:29:22Z
- Code family: SBC 801 (2024)
- Input: `D:/ConsultX_Clean/reports/sbc801_gap_completion_agent_report.json`
- Output dir: `D:/ConsultX_Clean/data/consultx_brain/full_corpus/extracted_gaps/sbc801_round2`

## Counts

- manual_review total (input): **161**
- token_budget_cap: **60**
- queued_for_extraction: **60**
- resolved: **24**
- quarantined: **36**
- manual_review_keep: **101**

## By-chapter completed

| chapter | resolved |
| ------- | -------: |
| 11 | 1 |
| 1 | 6 |
| 3 | 14 |
| 4 | 2 |
| 5 | 1 |

## Top resolved (chapter 9/10/11)

| section | chapter | body_chars | source_pdf | pages |
| ------- | ------- | ---------: | ---------- | ----- |
| 1104 | 11 | 1091 | SBC 801 - The Saudi Fire Protection Code (3)-801-1000.pdf | 200-200 |

## Quarantined (sample first 20)

| section | chapter | reason |
| ------- | ------- | ------ |
| 307.6 | 3 | header_not_found |
| 307.8 | 3 | header_not_found |
| 320.3 | 3 | quality_fail: body_chars=149 < 200 |
| 303.1.3 | 3 | header_not_found |
| 308.2.4 | 3 | header_not_found |
| 308.5.4 | 3 | header_not_found |
| 310.4.1 | 3 | header_not_found |
| 310.4.2 | 3 | header_not_found |
| 417 | 4 | header_not_found |
| 423 | 4 | quality_fail: non_letter_ratio=0.411 >= 0.3 |
| 424 | 4 | quality_fail: non_letter_ratio=0.378 >= 0.3 |
| 425 | 4 | quality_fail: non_letter_ratio=0.356 >= 0.3 |
| 426 | 4 | quality_fail: non_letter_ratio=0.325 >= 0.3 |
| 427 | 4 | quality_fail: non_letter_ratio=0.359 >= 0.3 |
| 403.5 | 4 | quality_fail: body_chars=162 < 200 |
| 404.6 | 4 | header_not_found |
| 406.4 | 4 | header_not_found |
| 406.5 | 4 | header_not_found |
| 406.6 | 4 | header_not_found |
| 406.7 | 4 | header_not_found |

## manual_review_keep (sample first 20)

- 5 / 506.2
- 5 / 507.3
- 5 / 507.5
- 5 / 508.1
- 5 / 508.2
- 5 / 508.5
- 5 / 503.1.1
- 5 / 503.2.3
- 5 / 510.4.1
- 5 / 510.4.2.4
- 5 / 510.4.2.5
- 7 / 718
- 7 / 718.2
- 7 / 711.2.4
- 7 / 716.2.6.4
- 12 / 1202
- 12 / 1203
- 12 / 1204
- 12 / 1205
- 12 / 1206
