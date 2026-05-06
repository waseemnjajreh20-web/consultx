/**
 * workflow_router.ts
 *
 * Classifies an Advisory query into one of the B1 workflow domains.
 *
 * FEATURE FLAG: ADVISORY_BRAIN_B2_ROUTER_ENABLED
 *   - "1"  → classify query; emit diagnostics only; NO behavior change yet.
 *   - anything else → return null; router inactive.
 *
 * Classification logic (priority order):
 *   1. Explicit code refs (e.g. "903.2.7", "Table 1004.5")
 *   2. Arabic + English domain keywords
 *   3. Source family context (SBC 201 vs SBC 801)
 *   4. B1 workflow metadata (domains)
 *
 * Advisory-only. Never invoked for Main (primary) or Analytical (analysis) modes.
 */

import type {
  AdvisoryBrainB1,
  RouterResult,
  WorkflowDomain,
  WorkflowId,
  ParkingLotRef,
} from "./brain_b1_types.ts";

// ── Feature flag ──────────────────────────────────────────────────────────────

export function isRouterEnabled(): boolean {
  return Deno.env.get("ADVISORY_BRAIN_B2_ROUTER_ENABLED") === "1";
}

// ── Keyword maps per domain ───────────────────────────────────────────────────

const DOMAIN_KEYWORDS: Array<{
  domain: WorkflowDomain;
  wf_id: WorkflowId;
  ar: string[];
  en: string[];
  refs: RegExp[];
}> = [
  {
    domain: "occupant_load",
    wf_id: "wf_occupant_load",
    ar: ["حمل إشغالي", "حمل الإشغال", "معامل الإشغال", "أشخاص لكل متر", "gross", "net",
         "1004.5", "جدول 1004"],
    en: ["occupant load", "occupant load factor", "floor area allowance", "gross floor", "net floor"],
    refs: [/\b1004\b/, /\b1004\.5\b/],
  },
  {
    domain: "egress",
    wf_id: "wf_egress",
    ar: ["مخرج", "مخارج", "مسار الخروج", "خروج طوارئ", "مسافة السفر", "ممر إخلاء",
         "عدد المخارج", "مخرج واحد", "درج طوارئ", "سلم الهروب", "باب المخرج",
         "1006", "1011", "1014", "1017", "1020"],
    en: ["egress", "exit", "means of egress", "exit access", "exit discharge",
         "travel distance", "common path", "corridor width", "stair", "occupant load egress"],
    refs: [/\b100[4-9]\b/, /\b101[0-9]\b/, /\b102[0-5]\b/],
  },
  {
    domain: "occupancy_classification",
    wf_id: "wf_occupancy_classification",
    ar: ["تصنيف الإشغال", "تصنيف المبنى", "مجموعة", "group", "فئة الإشغال",
         "إشغال مختلط", "استخدام مختلط", "group m", "group a", "group b",
         "group e", "group r", "group s", "group h", "group i",
         "مجموعة م", "مجموعة أ", "مجموعة ب"],
    en: ["occupancy group", "occupancy classification", "group m", "group a", "group b",
         "group e", "group r", "group s", "group h", "group i",
         "mixed occupancy", "mixed use", "separated occupancy", "accessory"],
    refs: [/\bsection\s*30[0-9]\b/i, /\b3\d\d\b/],
  },
  {
    domain: "sprinkler",
    wf_id: "wf_sprinkler",
    ar: ["رشاشات", "رشاش", "رش تلقائي", "نظام إطفاء", "نقطة رش", "رأس الرشاش",
         "fire area", "منطقة حريق", "مساحة الحريق", "903"],
    en: ["sprinkler", "automatic sprinkler", "fire sprinkler", "suppression system",
         "fire area", "sprinkler threshold", "903"],
    refs: [/\b903\b/, /\b903\.\d/, /\bfire.?area\b/i],
  },
  {
    domain: "fire_alarm",
    wf_id: "wf_fire_alarm",
    ar: ["إنذار حريق", "انذار", "نظام إنذار", "كاشف دخان", "مكشاف", "جرس إنذار",
         "إخطار الإشغال", "notification", "907"],
    en: ["fire alarm", "alarm system", "smoke detector", "manual pull station",
         "occupant notification", "notification appliance", "907"],
    refs: [/\b907\b/, /\b907\.\d/],
  },
  {
    domain: "fire_pump",
    wf_id: "wf_fire_pump",
    ar: ["مضخة حريق", "مضخة الحريق", "ضغط التغذية", "سعة المضخة", "913"],
    en: ["fire pump", "pump capacity", "pump pressure", "supply pressure", "913"],
    refs: [/\b913\b/, /\b913\.\d/],
  },
  {
    domain: "standpipe",
    wf_id: "wf_standpipe",
    ar: ["أنبوب ثابت", "standpipe", "خرطوم", "توصيل خرطوم", "نقطة خرطوم", "905"],
    en: ["standpipe", "hose connection", "hose cabinet", "class i", "class ii", "class iii", "905"],
    refs: [/\b905\b/, /\b905\.\d/],
  },
  {
    domain: "smoke_control",
    wf_id: "wf_smoke_control",
    ar: ["تحكم بالدخان", "التحكم بالدخان", "إدارة الدخان", "atrium", "أتريوم",
         "ضغط إيجابي", "ضغط سلبي", "909"],
    en: ["smoke control", "smoke management", "atrium smoke", "pressurization",
         "exhaust system", "909"],
    refs: [/\b909\b/, /\b909\.\d/],
  },
];

// ── Non-code detector ─────────────────────────────────────────────────────────

const CASUAL_AR = [
  "كيفك", "كيف الحال", "مرحبا", "السلام", "صباح الخير", "مساء الخير",
  "شكرا", "شكراً", "تمام", "أحسنت",
];
const CASUAL_EN = ["hi", "hello", "hey", "how are you", "good morning", "thanks"];

function isNonCode(query: string): boolean {
  const lower = query.toLowerCase().trim();
  if (!lower || lower.length < 3) return true;
  for (const kw of CASUAL_AR) {
    if (lower.includes(kw)) return true;
  }
  for (const kw of CASUAL_EN) {
    if (new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`, "i").test(lower)) return true;
  }
  return false;
}

// ── Score each domain ─────────────────────────────────────────────────────────

function scoreQuery(
  query: string
): Array<{ domain: WorkflowDomain; wf_id: WorkflowId; score: number; matched_by: string[] }> {
  const lower = query.toLowerCase();
  const scores: Array<{ domain: WorkflowDomain; wf_id: WorkflowId; score: number; matched_by: string[] }> = [];

  for (const cfg of DOMAIN_KEYWORDS) {
    let score = 0;
    const matched_by: string[] = [];

    // Explicit refs score highest (3 pts)
    for (const re of cfg.refs) {
      if (re.test(query)) {
        score += 3;
        matched_by.push(`explicit_ref:${re.source}`);
        break;
      }
    }

    // Arabic keywords (2 pts each, max 6)
    let arHits = 0;
    for (const kw of cfg.ar) {
      if (lower.includes(kw.toLowerCase()) && arHits < 3) {
        score += 2;
        arHits++;
        matched_by.push(`keyword_ar:${kw}`);
      }
    }

    // English keywords (1 pt each, max 3)
    let enHits = 0;
    for (const kw of cfg.en) {
      if (lower.includes(kw.toLowerCase()) && enHits < 3) {
        score += 1;
        enHits++;
        matched_by.push(`keyword_en:${kw}`);
      }
    }

    if (score > 0) {
      scores.push({ domain: cfg.domain, wf_id: cfg.wf_id, score, matched_by });
    }
  }

  return scores.sort((a, b) => b.score - a.score);
}

// ── Main router function ──────────────────────────────────────────────────────

export function routeAdvisoryQuery(
  query: string,
  brain: AdvisoryBrainB1 | null
): RouterResult | null {
  // Guard: flag must be ON
  if (!isRouterEnabled()) return null;

  // Non-code detection
  if (isNonCode(query)) {
    return {
      workflow_id: "wf_non_code",
      domain: "non_code",
      confidence: "high",
      matched_by: ["non_code_detector"],
      parking_lot_pre_check: [],
      required_inputs: [],
      workflow: null,
    };
  }

  const scores = scoreQuery(query);

  if (scores.length === 0) {
    // No domain match → general code lookup
    return {
      workflow_id: "wf_general_code_lookup",
      domain: "general_code_lookup",
      confidence: "low",
      matched_by: ["fallback"],
      parking_lot_pre_check: [],
      required_inputs: [],
      workflow: null,
    };
  }

  const best = scores[0];
  const confidence = best.score >= 5 ? "high" : best.score >= 2 ? "medium" : "low";

  // Look up the workflow from brain (if loaded)
  const workflow = brain?.workflows_by_id.get(best.wf_id) ?? null;

  // Pre-check parking-lot refs for this domain
  const parking_lot_pre_check: ParkingLotRef[] = workflow?.missing_or_parking_lot_refs ?? [];
  const required_inputs: string[] = workflow?.required_inputs ?? [];

  const result: RouterResult = {
    workflow_id: best.wf_id,
    domain: best.domain,
    confidence,
    matched_by: best.matched_by,
    parking_lot_pre_check,
    required_inputs,
    workflow,
  };

  console.log(
    `[RouterB2] selected_workflow=${result.workflow_id} ` +
    `confidence=${result.confidence} ` +
    `source_family=${detectSourceFamily(query)} ` +
    `required_inputs=${required_inputs.length} ` +
    `parking_lot_refs=${parking_lot_pre_check.length} ` +
    `matched_by=${result.matched_by.slice(0, 3).join(",")}`
  );

  return result;
}

// ── Source family helper ──────────────────────────────────────────────────────

function detectSourceFamily(query: string): string {
  const has201 = /\bsbc\s*201\b|\bsbc201\b/i.test(query);
  const has801 = /\bsbc\s*801\b|\bsbc801\b/i.test(query);
  if (has201 && has801) return "both";
  if (has201) return "SBC201";
  if (has801) return "SBC801";
  return "unspecified";
}

export { detectSourceFamily };
