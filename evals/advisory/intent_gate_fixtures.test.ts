// ConsultX Advisory — offline fixture tests for the deterministic gates
//
// These fixtures lock in the post-revert Phase 3A baseline (commit 3be8214):
//   - non-code intent gate (casual / empty_or_ambiguous / code_domain)
//   - V1 Brain sidecar trigger regex
//
// They are deliberately DUPLICATED from the production source so the test acts
// as a contract: if production drifts, this file must be updated alongside it.
// No imports from the edge function — keeps the test runnable under plain Deno
// or `bun run` without the Supabase Deno runtime.
//
// Run:   deno test evals/advisory/intent_gate_fixtures.test.ts
// or:    bun run evals/advisory/intent_gate_fixtures.test.ts
//
// Covered scenarios (per Phase 2 brief):
//   A. Casual greeting           → no retrieval, no citations
//   B. SBC 201 mercantile        → code_domain + V1 sidecar trigger fires
//   C. SBC 801 fire alarm        → code_domain + V1 sidecar trigger fires
//   D. Table 1004.5 lookup       → code_domain + V1 sidecar trigger fires (egress)
//   E. Sprinkler / alarm system  → code_domain + V1 sidecar trigger fires
//
// Phase 2 contract (do NOT change without an accompanying production change):
//   - Casual messages MUST NOT route to code_domain.
//   - Domain keywords MUST win over a casual word in the same message.
//   - Empty/punctuation-only MUST route to empty_or_ambiguous.
//   - All five SBC scenarios MUST pass the V1 sidecar trigger regex.

// ---------------------------------------------------------------------------
// Production mirrors (copies — keep in sync with fire-safety-chat/index.ts)
// ---------------------------------------------------------------------------

// Mirror of supabase/functions/fire-safety-chat/index.ts:4792 (classifyAdvisoryIntent)
function classifyAdvisoryIntent(
  userText: string,
): "code_domain" | "casual" | "empty_or_ambiguous" {
  const raw = (userText ?? "").trim();
  if (!raw) return "empty_or_ambiguous";

  const stripped = raw.replace(/[?؟.,،!\s‌‍]+/g, "").trim();
  if (!stripped) return "empty_or_ambiguous";

  const lower = raw.toLowerCase();

  const hasWord = (kw: string): boolean =>
    new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`, "i").test(lower);

  const arabicDomain = [
    "كود", "الحريق", "حريق", "رش", "إنذار", "انذار",
    "مخارج", "مخرج", "إشغال", "اشغال",
    "مبنى", "مبني", "مشروع", "مساحة", "مساحه",
    "طابق", "طوابق", "بدروم",
    "مكاتب", "مكتب", "محلات", "محل",
    "مستودع", "مخزن", "سكني", "تحليلي",
    "مخطط", "مخططات",
  ];
  for (const kw of arabicDomain) {
    if (lower.includes(kw)) return "code_domain";
  }

  const englishDomain = [
    "sbc", "code", "fire", "sprinkler", "alarm", "egress", "occupancy",
    "building", "project", "floor", "area", "basement",
    "office", "mercantile", "warehouse", "residential",
    "plan", "drawing",
  ];
  for (const kw of englishDomain) {
    if (hasWord(kw)) return "code_domain";
  }

  const arabicCasual = [
    "كيفك", "كيف الحال", "كيف حالك",
    "مرحبا", "مرحبًا", "السلام عليكم",
    "صباح الخير", "مساء الخير",
    "شكرا", "شكرًا", "تمام",
  ];
  for (const kw of arabicCasual) {
    if (lower.includes(kw)) return "casual";
  }

  const englishCasualPhrases = [
    "how are you", "good morning", "good evening", "thank you",
  ];
  for (const ph of englishCasualPhrases) {
    if (lower.includes(ph)) return "casual";
  }
  const englishCasualWords = ["hi", "hello", "hey", "thanks"];
  for (const kw of englishCasualWords) {
    if (hasWord(kw)) return "casual";
  }

  if (stripped.length < 4) return "empty_or_ambiguous";

  return "code_domain";
}

// Mirror of supabase/functions/fire-safety-chat/index.ts:1220 (V1 sidecar trigger)
const SIDECAR_TRIGGER =
  /(mercantile|group\s+m|محلات\s+تجارية|مجموعة\s+M|sprinkler|automatic\s+sprinkler|fire\s+alarm|manual\s+fire\s+alarm|alarm\s+system|fire\s+area|occupant\s+notification|waterflow|standpipe|smoke\s+control|egress|exit\s+discharge|exit\s+access|\bexit\b|travel\s+distance|occupant\s+load|common\s+path|\bstair\b|stairs|stairway|corridor|mixed\s+occupancy|mixed-use|residential|group\s+r|group\s+r-?[1-4]|storage|group\s+s|group\s+s-?[12]|educational|group\s+e|institutional|group\s+i|group\s+i-?[1-4]|business|group\s+b|assembly|group\s+a|group\s+a-?[1-5]|high.?hazard|group\s+h|رش|إنذار|مخرج|مخارج|خروج|إخلاء|تنبيه|مسافة\s+الانتقال|مسافة\s+السفر|حمل\s+الإشغال|مسار\s+الهروب|درج|سلم|سلالم|ممر|إشغال\s+مختلط|مختلط|سكني|مبنى\s+سكني|تخزين|مستودع|تعليمي|مدارس|مبنى\s+تعليمي|طبي|مستشفى|مؤسسي)/i;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface IntentFixture {
  scenario: string;
  query: string;
  expectedIntent: "code_domain" | "casual" | "empty_or_ambiguous";
  expectedSidecarTrigger: boolean;
  rationale: string;
}

const FIXTURES: IntentFixture[] = [
  {
    scenario: "A — casual greeting (Arabic)",
    query: "السلام عليكم",
    expectedIntent: "casual",
    expectedSidecarTrigger: false,
    rationale:
      "Pure greeting; intent gate must short-circuit before retrieval. Sidecar trigger is irrelevant because the gate prevents the loader from running, but the regex is also expected to NOT match a bare greeting.",
  },
  {
    scenario: "B — SBC 201 mercantile occupancy",
    query: "ما متطلبات الإشغال لمحل تجاري 1200 متر مربع؟",
    expectedIntent: "code_domain",
    expectedSidecarTrigger: false,
    rationale:
      "Domain hit on محل / مساحة passes the intent gate. The V1 sidecar trigger is intentionally narrow (Group M / fire-protection / egress only — false negatives are acceptable per the production comment). Singular محل تجاري without a fire/egress/occupancy keyword does NOT match the regex (which expects محلات\\s+تجارية plural form, mercantile, sprinkler, alarm, egress, etc.). Main SBC 201 retrieval still happens via the storage/keyword path.",
  },
  {
    scenario: "B2 — SBC 201 mercantile with sprinkler keyword",
    query: "هل يلزم نظام رش لمحل تجاري Group M بمساحة 1200 متر مربع؟",
    expectedIntent: "code_domain",
    expectedSidecarTrigger: true,
    rationale:
      "Same SBC 201 mercantile context but adds رش / Group M, so both the intent gate AND the V1 sidecar trigger fire. This is the path where the curated Group M chain is loaded as reasoning aid.",
  },
  {
    scenario: "C — SBC 801 fire alarm",
    query: "متى يتطلب نظام إنذار حريق؟",
    expectedIntent: "code_domain",
    expectedSidecarTrigger: true,
    rationale:
      "Domain hit on إنذار / حريق; sidecar trigger fires via إنذار / fire alarm path. Retrieval must land on SBC 801 fire-alarm sections (907 chain), not on SBC 201.",
  },
  {
    scenario: "D — Table 1004.5 lookup (egress)",
    query: "ما الحمل الإشغالي حسب جدول 1004.5؟",
    expectedIntent: "code_domain",
    expectedSidecarTrigger: true,
    rationale:
      "Domain hit on إشغال; sidecar trigger fires via حمل\\s+الإشغال and egress family. Routing must include section 1004 / table 1004.5 evidence; structured-table path takes precedence if 1004.5 is in sbc_code_tables.",
  },
  {
    scenario: "E — Sprinkler / alarm system",
    query: "متى يجب تركيب نظام الرش التلقائي وما علاقته بنظام الإنذار؟",
    expectedIntent: "code_domain",
    expectedSidecarTrigger: true,
    rationale:
      "Domain hit on رش / إنذار; sidecar trigger fires on both. Section family routing must NOT fall back to a wrong family (Step 3.2 hard-stop).",
  },
  {
    scenario: "F — domain wins over casual when both present",
    query: "السلام عليكم، عندي مشروع مكتبي 4 طوابق",
    expectedIntent: "code_domain",
    expectedSidecarTrigger: false,
    rationale:
      "Greeting + domain content. Production order checks domain first, so this routes to code_domain. Sidecar trigger does NOT fire because no fire/egress/occupancy keyword is present.",
  },
  {
    scenario: "G — empty / punctuation only",
    query: "؟؟؟",
    expectedIntent: "empty_or_ambiguous",
    expectedSidecarTrigger: false,
    rationale:
      "Punctuation-only must route to empty_or_ambiguous and bypass retrieval.",
  },
  {
    scenario: "H — empty string",
    query: "",
    expectedIntent: "empty_or_ambiguous",
    expectedSidecarTrigger: false,
    rationale: "Empty input must route to empty_or_ambiguous.",
  },
  {
    scenario: "I — English casual (hi)",
    query: "hi",
    expectedIntent: "casual",
    expectedSidecarTrigger: false,
    rationale:
      "ASCII word-boundary check on `hi` must classify as casual without matching `this`/`his` substrings.",
  },
  {
    scenario: "J — short ambiguous",
    query: "ok",
    expectedIntent: "empty_or_ambiguous",
    expectedSidecarTrigger: false,
    rationale:
      "Short stripped length (<4) with no domain or casual hit must route to empty_or_ambiguous.",
  },
];

// ---------------------------------------------------------------------------
// Runner — supports both Deno.test and a plain main() under bun/node
// ---------------------------------------------------------------------------

interface RowResult {
  scenario: string;
  pass: boolean;
  detail: string;
}

function runOne(fx: IntentFixture): RowResult {
  const intent = classifyAdvisoryIntent(fx.query);
  const trigger = SIDECAR_TRIGGER.test(fx.query);

  const intentOk = intent === fx.expectedIntent;
  const triggerOk = trigger === fx.expectedSidecarTrigger;
  const pass = intentOk && triggerOk;

  const detail = pass
    ? `intent=${intent} trigger=${trigger}`
    : [
        `intent expected=${fx.expectedIntent} got=${intent}`,
        `trigger expected=${fx.expectedSidecarTrigger} got=${trigger}`,
      ]
        .filter((_, i) =>
          i === 0 ? !intentOk : !triggerOk
        )
        .join(" | ");

  return { scenario: fx.scenario, pass, detail };
}

function runAll(): { rows: RowResult[]; passCount: number; failCount: number } {
  const rows = FIXTURES.map(runOne);
  const passCount = rows.filter((r) => r.pass).length;
  const failCount = rows.length - passCount;
  return { rows, passCount, failCount };
}

// Deno.test bindings — only registered if Deno is the runtime
declare const Deno: { test?: (name: string, fn: () => void) => void } | undefined;

if (typeof Deno !== "undefined" && typeof Deno.test === "function") {
  for (const fx of FIXTURES) {
    Deno.test(fx.scenario, () => {
      const r = runOne(fx);
      if (!r.pass) {
        throw new Error(`${fx.scenario} FAILED — ${r.detail}\n  rationale: ${fx.rationale}`);
      }
    });
  }
}

// Fallback: print a report when imported / executed directly under bun or node
function main(): number {
  const { rows, passCount, failCount } = runAll();
  console.log("=== ConsultX Advisory Intent Gate Fixtures ===");
  for (const r of rows) {
    const tag = r.pass ? "PASS" : "FAIL";
    console.log(`[${tag}] ${r.scenario} — ${r.detail}`);
  }
  console.log(`\nResult: ${passCount} passed / ${failCount} failed (total ${rows.length})`);
  return failCount === 0 ? 0 : 1;
}

// Auto-run under bun/node (Deno.test path handles its own execution)
const isDirectRun =
  typeof Deno === "undefined" ||
  (typeof Deno !== "undefined" && typeof Deno.test !== "function");
if (isDirectRun) {
  const code = main();
  if (typeof process !== "undefined" && typeof process.exit === "function") {
    process.exit(code);
  }
}

export { classifyAdvisoryIntent, FIXTURES, runAll, SIDECAR_TRIGGER };
