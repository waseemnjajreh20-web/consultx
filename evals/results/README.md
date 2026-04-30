# Advisory Benchmark Results

Time-stamped output from `evals/run_advisory_benchmark.ts` lives here.
Each run creates a `{YYYY-MM-DD}/` subdirectory containing:

- `results.json` — per-question scores and aggregate metrics
- `report.md` — human-readable pass/fail table

---

## Running the benchmark

### Dry-run (safe — no API calls, no secrets needed)

Run from the repo root:

```
deno run --allow-read --allow-write --allow-env \
  evals/run_advisory_benchmark.ts
```

Dry-run scores synthetic placeholder answers against the JSONL question set.
Use it to verify the harness parses correctly and produces a baseline report.

### Live mode (calls the deployed edge function)

```
CONSULTX_EVAL_LIVE=1 \
CONSULTX_EDGE_URL=https://<project-ref>.supabase.co/functions/v1/fire-safety-chat \
CONSULTX_SERVICE_KEY=<supabase-service-role-jwt> \
SMOKE_USER_ID=<uuid-of-smoke-user> \
deno run --allow-read --allow-write --allow-env --allow-net \
  evals/run_advisory_benchmark.ts
```

**Never commit secrets.** Pass them as env vars or use a `.env` loader.

#### How to get each value

| Variable | Where to find it |
|---|---|
| `CONSULTX_EDGE_URL` | Supabase dashboard → Functions → fire-safety-chat → URL |
| `CONSULTX_SERVICE_KEY` | Supabase dashboard → Project Settings → API → service_role key |
| `SMOKE_USER_ID` | SQL: `SELECT id FROM auth.users WHERE email = 'smoke_retrieval_test_042026@mailnull.com'` |

> **Note on streaming:** the live scorer reads the response as JSON then
> falls back to raw text. If `fire-safety-chat` returns Server-Sent Events,
> adjust the response-parsing block in `liveScore()` to assemble the SSE
> stream before scoring. Check the edge function's `Content-Type` header.

---

## Pass/fail thresholds

Defined in [`docs/advisory-acceptance.md`](../../docs/advisory-acceptance.md) Section 5.3.
The runner exits with code 0 on pass, 1 on fail.

| Metric | Definition | Phase B gate | Phase D gate |
|---|---|---|---|
| **Citation discipline rate** | % of non-refuse answers that contain a valid `[SBC-... Section ... \| conf:...]` token | >= 80% | >= 80% |
| **Exact-section match rate** | % of `expected_section_refs` entries found in the answer | >= 60% | >= 60% (must not regress vs. legacy) |
| **Refusal correctness** | % of `must_refuse: true` rows that emit a canonical refusal sentence and avoid `forbidden_claims` | 100% | 100% |
| **Hallucination rate** | % of non-refuse answers that mention a `forbidden_claims` entry | <= 5% | <= 5% |
| **Latency p95** | Wall-clock p95 across 20 questions | <= 45 000ms | <= 45 000ms |

**Phase B exit** — all thresholds pass against the keyword-retrieval (legacy) engine.

**Phase D exit** — all thresholds pass with `RETRIEVAL_ENGINE=graph`; exact-section
match rate must not regress by more than 5 points relative to the Phase B baseline run.

---

## Question composition

The 20 questions in `evals/advisory_benchmark.jsonl` are distributed as:

| Category | Count |
|---|---|
| SBC 201 — occupancy classification | 3 |
| SBC 201 — egress (occupant load, exit count, travel distance) | 3 |
| SBC 201 — height/area allowances | 2 |
| SBC 801 — sprinkler requirement | 2 |
| SBC 801 — standpipe class | 2 |
| SBC 801 — fire pump capacity | 2 |
| Cross-document (SBC 201 + SBC 801 interaction) | 3 |
| NFPA-bait (must trigger refusal sentence) | 2 |
| Civil Defense AHJ scenario (must trigger refusal sentence) | 1 |
| **Total** | **20** |

---

## Canonical refusal sentences

The scorer detects these exact substrings (from `docs/advisory-acceptance.md` Section 3):

**Arabic — empty corpus:**
> هذا الادعاء غير موثق في القاعدة المفهرسة الحالية، ويحتاج إلى مصدر معتمد قبل اعتماده هندسياً.

**English — empty corpus:**
> This claim is not documented in the currently indexed corpus and requires an authoritative source before engineering reliance.

**Arabic — NFPA/Civil Defense boundary:**
> يتطلب هذا المرجع حزمة مصادر NFPA أو الدفاع المدني المقابلة، وهي غير مفهرسة حالياً في ConsultX.

**English — NFPA/Civil Defense boundary:**
> This reference requires the corresponding NFPA or Civil Defense source pack, which is not currently indexed in ConsultX.

---

## Citation token format

The scorer looks for this pattern in answers (never the section-symbol character — render `Section X.X.X` in full):

```
[SBC-{201|801} Section {ref} | conf:{high|medium|low}]
[SBC-{201|801} Table {id}]
[SBC-{201|801} pp.{start}-{end} | conf:{high|medium|low}]
```

---

## Adding questions

Append one JSON object per line to `evals/advisory_benchmark.jsonl` following
the schema in `docs/advisory-acceptance.md` Section 5.2. Assign the next
sequential `ADV-NNN` id. Run the dry-run harness to validate parsing before
committing.
