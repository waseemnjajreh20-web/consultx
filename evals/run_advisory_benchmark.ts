#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write
/**
 * ConsultX Advisory Benchmark Runner — Phase G skeleton
 *
 * Dry-run by default: parses advisory_benchmark.jsonl, scores placeholder
 * answers, and writes a baseline report without calling the edge function.
 *
 * Live mode: set CONSULTX_EVAL_LIVE=1 to call the deployed edge function.
 *
 * Required env vars for live mode:
 *   CONSULTX_EDGE_URL    — https://<ref>.supabase.co/functions/v1/fire-safety-chat
 *   CONSULTX_SERVICE_KEY — Supabase service-role JWT (never commit)
 *   SMOKE_USER_ID        — UUID of smoke_retrieval_test_042026@mailnull.com
 *
 * Output written to: evals/results/{YYYY-MM-DD}/results.json + report.md
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkRow {
  id: string;
  question_ar: string;
  question_en: string;
  expected_section_refs: string[];
  expected_table_ids: string[];
  forbidden_claims: string[];
  must_refuse: boolean;
  refuse_reason: string | null;
  category: string;
}

interface EvalResult {
  id: string;
  category: string;
  must_refuse: boolean;
  has_sbc_citation_token: boolean;
  has_refusal_sentence: boolean;
  mentions_forbidden_claim: boolean;
  expected_sections_found: number;
  expected_sections_total: number;
  latency_ms: number;
  answer_preview: string;
  error?: string;
}

interface RunReport {
  run_date: string;
  mode: "dry-run" | "live";
  total: number;
  citation_discipline_rate: number;
  exact_section_match_rate: number;
  refusal_correctness: number;
  hallucination_rate: number;
  latency_p95_ms: number;
  pass: boolean;
  results: EvalResult[];
}

// ---------------------------------------------------------------------------
// Canonical refusal sentences from docs/advisory-acceptance.md Section 3
// ---------------------------------------------------------------------------

const REFUSAL_MARKERS = [
  "هذا الادعاء غير موثق في القاعدة المفهرسة الحالية",
  "This claim is not documented in the currently indexed corpus",
  "يتطلب هذا المرجع حزمة مصادر NFPA أو الدفاع المدني",
  "This reference requires the corresponding NFPA or Civil Defense source pack",
];

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function hasSBCCitationToken(text: string): boolean {
  // Matches: [SBC-201 Section 1.2.3 | conf:high]
  //          [SBC-801 Table 903.2.1]
  //          [SBC-201 pp.412-415 | conf:medium]
  return /\[SBC-(?:201|801)\s+(?:Section\s+[\d.]+|Table\s+[\w.]+|pp\.[\d]+-[\d]+)/.test(text);
}

function hasRefusalSentence(text: string): boolean {
  return REFUSAL_MARKERS.some((marker) => text.includes(marker));
}

function mentionsForbiddenClaim(text: string, forbidden: string[]): boolean {
  if (forbidden.length === 0) return false;
  return forbidden.some((f) => text.toLowerCase().includes(f.toLowerCase()));
}

function countExpectedSectionsFound(text: string, refs: string[]): number {
  return refs.filter((ref) => text.includes(ref)).length;
}

// ---------------------------------------------------------------------------
// Dry-run scorer — produces a synthetic passing answer for baseline output
// ---------------------------------------------------------------------------

function dryRunScore(row: BenchmarkRow): EvalResult {
  let placeholder: string;
  if (row.must_refuse) {
    placeholder =
      "يتطلب هذا المرجع حزمة مصادر NFPA أو الدفاع المدني المقابلة، وهي غير مفهرسة حالياً في ConsultX. " +
      "This reference requires the corresponding NFPA or Civil Defense source pack, which is not currently indexed in ConsultX.";
  } else {
    const firstRef = row.expected_section_refs[0] ?? "1.1";
    const doc = row.category.startsWith("SBC-801") ? "801" : "201";
    placeholder = `[SBC-${doc} Section ${firstRef} | conf:medium] Dry-run placeholder — no API call made. ` +
      row.expected_section_refs.map((r) => `Section ${r}`).join(", ");
  }

  return {
    id: row.id,
    category: row.category,
    must_refuse: row.must_refuse,
    has_sbc_citation_token: hasSBCCitationToken(placeholder),
    has_refusal_sentence: hasRefusalSentence(placeholder),
    mentions_forbidden_claim: mentionsForbiddenClaim(placeholder, row.forbidden_claims),
    expected_sections_found: countExpectedSectionsFound(placeholder, row.expected_section_refs),
    expected_sections_total: row.expected_section_refs.length,
    latency_ms: 0,
    answer_preview: placeholder.slice(0, 200),
  };
}

// ---------------------------------------------------------------------------
// Live scorer — calls the deployed fire-safety-chat edge function
// ---------------------------------------------------------------------------

async function liveScore(
  row: BenchmarkRow,
  edgeUrl: string,
  serviceKey: string,
  userId: string,
): Promise<EvalResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: row.question_ar }],
        mode: "standard",
        userId,
      }),
    });

    const latency_ms = Date.now() - t0;

    if (!res.ok) {
      const body = await res.text();
      return errorResult(row, latency_ms, `HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    // Edge function may respond as JSON or as a streaming text body.
    // Attempt JSON parse first; fall back to raw text.
    // TODO: if the function uses Server-Sent Events, replace this with SSE
    //       stream assembly. Check fire-safety-chat/index.ts response shape.
    const body = await res.text();
    let answer: string;
    try {
      const json = JSON.parse(body);
      answer =
        json?.content ?? json?.response ?? json?.text ??
        json?.candidates?.[0]?.content?.parts?.[0]?.text ??
        body;
    } catch {
      answer = body;
    }

    return {
      id: row.id,
      category: row.category,
      must_refuse: row.must_refuse,
      has_sbc_citation_token: hasSBCCitationToken(answer),
      has_refusal_sentence: hasRefusalSentence(answer),
      mentions_forbidden_claim: mentionsForbiddenClaim(answer, row.forbidden_claims),
      expected_sections_found: countExpectedSectionsFound(answer, row.expected_section_refs),
      expected_sections_total: row.expected_section_refs.length,
      latency_ms,
      answer_preview: answer.slice(0, 200),
    };
  } catch (err) {
    return errorResult(row, Date.now() - t0, String(err));
  }
}

function errorResult(row: BenchmarkRow, latency_ms: number, error: string): EvalResult {
  return {
    id: row.id,
    category: row.category,
    must_refuse: row.must_refuse,
    has_sbc_citation_token: false,
    has_refusal_sentence: false,
    mentions_forbidden_claim: false,
    expected_sections_found: 0,
    expected_sections_total: row.expected_section_refs.length,
    latency_ms,
    answer_preview: "",
    error,
  };
}

// ---------------------------------------------------------------------------
// Aggregate metrics
// ---------------------------------------------------------------------------

function computeMetrics(results: EvalResult[], mode: "dry-run" | "live"): RunReport {
  const date = new Date().toISOString().slice(0, 10);
  const total = results.length;

  const nonRefuseRows = results.filter((r) => !r.must_refuse);
  const refuseRows = results.filter((r) => r.must_refuse);

  // Citation discipline: non-refuse rows with at least one citation token
  const citationDiscipline = nonRefuseRows.length === 0 ? 1 :
    nonRefuseRows.filter((r) => r.has_sbc_citation_token).length / nonRefuseRows.length;

  // Exact-section match: expected section refs found across all non-refuse rows
  const totalExpected = nonRefuseRows.reduce((s, r) => s + r.expected_sections_total, 0);
  const totalFound = nonRefuseRows.reduce((s, r) => s + r.expected_sections_found, 0);
  const sectionMatchRate = totalExpected === 0 ? 1 : totalFound / totalExpected;

  // Refusal correctness: must_refuse rows that emit a refusal sentence and
  //                      do NOT mention any forbidden claim
  const refusalCorrectness = refuseRows.length === 0 ? 1 :
    refuseRows.filter((r) => r.has_refusal_sentence && !r.mentions_forbidden_claim).length /
    refuseRows.length;

  // Hallucination stub: non-refuse rows that mention a forbidden claim
  const hallucinationRate = nonRefuseRows.length === 0 ? 0 :
    nonRefuseRows.filter((r) => r.mentions_forbidden_claim).length / nonRefuseRows.length;

  // Latency p95 (0ms for dry-run)
  const latencies = results.map((r) => r.latency_ms).sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1);
  const latencyP95 = latencies[p95Index] ?? 0;

  const pass =
    citationDiscipline >= 0.80 &&
    refusalCorrectness >= 1.00 &&
    hallucinationRate <= 0.05 &&
    (mode === "dry-run" || latencyP95 <= 45_000);

  return {
    run_date: date,
    mode,
    total,
    citation_discipline_rate: Math.round(citationDiscipline * 100),
    exact_section_match_rate: Math.round(sectionMatchRate * 100),
    refusal_correctness: Math.round(refusalCorrectness * 100),
    hallucination_rate: Math.round(hallucinationRate * 100),
    latency_p95_ms: latencyP95,
    pass,
    results,
  };
}

// ---------------------------------------------------------------------------
// Markdown report renderer
// ---------------------------------------------------------------------------

function renderReport(report: RunReport): string {
  const status = report.pass ? "PASS" : "FAIL";
  const lines: string[] = [
    `# ConsultX Advisory Benchmark — ${report.run_date} (${report.mode})`,
    "",
    `**Overall result: ${status}**`,
    "",
    "## Aggregate scores",
    "",
    "| Metric | Score | Threshold | Result |",
    "|---|---|---|---|",
    `| Citation discipline rate | ${report.citation_discipline_rate}% | >= 80% | ${report.citation_discipline_rate >= 80 ? "PASS" : "FAIL"} |`,
    `| Exact-section match rate | ${report.exact_section_match_rate}% | >= 60% | ${report.exact_section_match_rate >= 60 ? "PASS" : "FAIL"} |`,
    `| Refusal correctness | ${report.refusal_correctness}% | 100% | ${report.refusal_correctness >= 100 ? "PASS" : "FAIL"} |`,
    `| Hallucination rate | ${report.hallucination_rate}% | <= 5% | ${report.hallucination_rate <= 5 ? "PASS" : "FAIL"} |`,
    `| Latency p95 | ${report.latency_p95_ms}ms | <= 45000ms | ${report.mode === "dry-run" ? "n/a (dry-run)" : report.latency_p95_ms <= 45000 ? "PASS" : "FAIL"} |`,
    "",
    "## Per-question results",
    "",
    "| ID | Category | Citation token | Refusal sentence | Forbidden claim | Sections found | Latency | Error |",
    "|---|---|---|---|---|---|---|---|",
  ];

  for (const r of report.results) {
    const sectionFrac = r.expected_sections_total > 0
      ? `${r.expected_sections_found}/${r.expected_sections_total}`
      : "n/a";
    const flagForbidden = r.mentions_forbidden_claim ? "**YES**" : "no";
    lines.push(
      `| ${r.id} | ${r.category} | ${r.has_sbc_citation_token ? "yes" : "no"} | ${r.has_refusal_sentence ? "yes" : "no"} | ${flagForbidden} | ${sectionFrac} | ${r.latency_ms}ms | ${r.error ?? ""} |`,
    );
  }

  lines.push(
    "",
    "---",
    "",
    `_Generated by \`evals/run_advisory_benchmark.ts\` — ${report.mode} mode_`,
    `_Pass thresholds defined in \`docs/advisory-acceptance.md\` Section 5.3_`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const isLive = Deno.env.get("CONSULTX_EVAL_LIVE") === "1";
  const mode: "dry-run" | "live" = isLive ? "live" : "dry-run";

  const jsonlText = await Deno.readTextFile("./evals/advisory_benchmark.jsonl");
  const rows: BenchmarkRow[] = jsonlText
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));

  console.log(`Loaded ${rows.length} benchmark questions.`);
  console.log(`Mode: ${isLive ? "LIVE — calling deployed edge function" : "DRY-RUN — no API calls"}`);

  if (!isLive) {
    console.log("Set CONSULTX_EVAL_LIVE=1 to run against the deployed edge function.\n");
  }

  let results: EvalResult[];

  if (!isLive) {
    results = rows.map(dryRunScore);
  } else {
    const edgeUrl = Deno.env.get("CONSULTX_EDGE_URL");
    const serviceKey = Deno.env.get("CONSULTX_SERVICE_KEY");
    const userId = Deno.env.get("SMOKE_USER_ID");

    if (!edgeUrl || !serviceKey || !userId) {
      console.error(
        "Live mode requires CONSULTX_EDGE_URL, CONSULTX_SERVICE_KEY, and SMOKE_USER_ID.\n" +
        "See evals/results/README.md for setup instructions.",
      );
      Deno.exit(1);
    }

    results = [];
    for (const row of rows) {
      console.log(`  Running ${row.id} (${row.category})...`);
      const result = await liveScore(row, edgeUrl, serviceKey, userId);
      results.push(result);
      const suffix = result.error
        ? ` ERROR: ${result.error}`
        : ` ${result.latency_ms}ms`;
      console.log(`    ${result.id} done.${suffix}`);
    }
  }

  const report = computeMetrics(results, mode);

  const dateDir = `./evals/results/${report.run_date}`;
  await Deno.mkdir(dateDir, { recursive: true });
  await Deno.writeTextFile(`${dateDir}/results.json`, JSON.stringify(report, null, 2));
  await Deno.writeTextFile(`${dateDir}/report.md`, renderReport(report));

  console.log(`\nResults written to ${dateDir}/`);
  console.log(`  Overall:                ${report.pass ? "PASS" : "FAIL"}`);
  console.log(`  Citation discipline:    ${report.citation_discipline_rate}%  (threshold >= 80%)`);
  console.log(`  Exact-section match:    ${report.exact_section_match_rate}%  (threshold >= 60%)`);
  console.log(`  Refusal correctness:    ${report.refusal_correctness}%  (threshold 100%)`);
  console.log(`  Hallucination rate:     ${report.hallucination_rate}%  (threshold <= 5%)`);
  console.log(`  Latency p95:            ${report.latency_p95_ms}ms  (threshold <= 45000ms)`);

  Deno.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  Deno.exit(1);
});
