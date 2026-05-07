# R23 — Vercel Auth Check

**Date:** 2026-05-07  
**Task:** TASK 1 — Verify Vercel CLI auth and token before attempting redeploy  
**Result:** AUTHORIZED

---

## Auth Token Location

```
C:\Users\TOSHIBA\AppData\Roaming\com.vercel.cli\Data\auth.json
```

Token: `vca_8q3DDYVWFByKxxkChPLChqLPd0ehB3cawsKr0R9aYPHq1hl8oj3Pda8P`  
UserId: `quE4AtP8iPu1dLhQx7Op9p8C`  
ExpiresAt: `1778198396` (valid at time of R23)

---

## Identity Verified

```
GET /v2/user
→ username: waseemnjajreh20-web
→ team: waseemnjajreh20-webs-projects (team_yM4uvzEPQAQXN8k0ISIdfTaP)
```

---

## Project Located

```
Project ID:   prj_3wFenMbRhnZiTiHNU5fSCXufg7dC
Project name: consultx
Team:         team_yM4uvzEPQAQXN8k0ISIdfTaP
gitBranch:    None (no explicit production branch — deploys from default)
```

---

## Status

- [x] Token present and valid
- [x] User authenticated as project owner
- [x] Correct project identified
- [x] Authorization confirmed → proceed to TASK 2
