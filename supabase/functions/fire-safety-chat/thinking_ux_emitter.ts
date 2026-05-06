/**
 * thinking_ux_emitter.ts
 *
 * Dynamic, workflow-aware thinking status messages for Advisory mode.
 * Replaces the static "جاري البحث بالمصادر" / "يجري التحليل" strings.
 *
 * FEATURE FLAG: ADVISORY_DYNAMIC_THINKING_ENABLED
 *   - "1"  → emit workflow-specific status messages
 *   - anything else → return null; frontend uses old static strings (no behavior change)
 *
 * Events emitted (at most one per category per question):
 *   routing        — right after workflow selection
 *   inputs_check   — when required_inputs are being validated
 *   retrieval      — when chunk retrieval is in flight
 *   parking_lot    — when query hits a parking-lot ref
 *   composition    — right before composing the answer
 *
 * RULES:
 *   - Never expose chain-of-thought, scoring numbers, or model self-talk
 *   - Messages describe WHAT KIND of work is happening, not internal reasoning
 *   - Arabic primary, English mirror
 *   - Max 80 display chars per message
 *   - No U+00A7 § character anywhere
 *
 * Advisory-only. Never invoked for Main (primary) or Analytical (analysis) modes.
 */

import type { WorkflowDomain, RouterResult } from "./brain_b1_types.ts";

// ── Feature flag ──────────────────────────────────────────────────────────────

export function isDynamicThinkingEnabled(): boolean {
  return Deno.env.get("ADVISORY_DYNAMIC_THINKING_ENABLED") === "1";
}

// ── Status event type ─────────────────────────────────────────────────────────

export type ThinkingPhase =
  | "routing"
  | "inputs_check"
  | "retrieval"
  | "parking_lot_notice"
  | "composition";

export interface ThinkingEvent {
  phase: ThinkingPhase;
  ar: string;
  en: string;
}

// ── Message matrix: domain × phase ───────────────────────────────────────────

const MESSAGES: Record<WorkflowDomain | "non_code" | "general_code_lookup", Partial<Record<ThinkingPhase, { ar: string; en: string }>>> = {
  occupancy_classification: {
    routing: {
      ar: "أحدّد تصنيف الإشغال المطلوب قبل تجميع الجواب...",
      en: "Identifying the occupancy group before composing the answer...",
    },
    inputs_check: {
      ar: "أتحقق من الوصف الوظيفي والإشغال المتوقع...",
      en: "Confirming the use description and expected load...",
    },
    retrieval: {
      ar: "أحضر القسم المرتبط بالتصنيف من SBC 201 الفصل 3...",
      en: "Pulling SBC 201 Chapter 3 section for the matching group...",
    },
    composition: {
      ar: "أربط النص الحرفي بالمجموعة وأرفق الاستشهاد...",
      en: "Linking verbatim text to the group with citation...",
    },
  },

  occupant_load: {
    routing: {
      ar: "أربط المساحة بجدول الحمل الإشغالي وأفصل بين النص والحساب...",
      en: "Linking floor area to occupant-load table; separating text from calculation...",
    },
    inputs_check: {
      ar: "أتحقق من المساحة بالأمتار المربعة والوظيفة قبل الحساب...",
      en: "Confirming floor area in m² and space function before calculation...",
    },
    retrieval: {
      ar: "أحدّد الجدول 1004.5 وأقرأ الصف الموافق للوظيفة...",
      en: "Locating Table 1004.5 and reading the row matching the function...",
    },
    composition: {
      ar: "أقتبس قيمة الـ gross/net الحرفية من الصف وأذكر الصفحة...",
      en: "Quoting the verbatim gross/net value from the row with page anchor...",
    },
  },

  egress: {
    routing: {
      ar: "أحدّد قواعد المخارج بحسب الإشغال والحمل وعدد الطوابق...",
      en: "Identifying egress rules by occupancy, load, and story count...",
    },
    inputs_check: {
      ar: "أراجع الحمل الإشغالي ورشاش الحماية وعدد المخارج المتاحة...",
      en: "Reviewing occupant load, sprinkler protection, and current exit count...",
    },
    retrieval: {
      ar: "أحضر الجدول 1006.3.3 والفقرات الداعمة من الفصل 10...",
      en: "Pulling Table 1006.3.3 and chapter-10 supporting paragraphs...",
    },
    composition: {
      ar: "أقتبس الصف من الجدول وأرفق الاستشهاد بالصفحة والمصدر...",
      en: "Quoting the table row with page-anchored citation...",
    },
  },

  sprinkler: {
    routing: {
      ar: "أفصل بين نوع الإشغال ومساحة منطقة الحريق قبل تطبيق عتبات الرش...",
      en: "Separating occupancy type from fire-area size before applying sprinkler thresholds...",
    },
    inputs_check: {
      ar: "أتحقق هل السؤال عن fire area أم مساحة إجمالية...",
      en: "Checking whether the question is about fire area vs total area...",
    },
    parking_lot_notice: {
      ar: "متطلبات الرشاشات قيد المراجعة — أتحقق من المصدر قبل الجواب...",
      en: "Sprinkler requirements under review — verifying source bounds before answering...",
    },
    composition: {
      ar: "أوجّه إلى الـ PDF الرسمي للفقرة 903 لأن النص لم يُرفَع بعد...",
      en: "Pointing to official PDF for Section 903 since the text is not in the V4 corpus...",
    },
  },

  fire_alarm: {
    routing: {
      ar: "أحدّد النظام الإنذاري المطلوب من الإشغال وعدد الإشغال...",
      en: "Identifying the alarm system from occupancy and load...",
    },
    inputs_check: {
      ar: "أراجع الإشغال ومساحة المبنى قبل تطبيق متطلبات الإنذار...",
      en: "Reviewing occupancy and building area before applying alarm requirements...",
    },
    parking_lot_notice: {
      ar: "متطلبات إنذار الحريق قيد المراجعة — أتحقق من حدود المصدر...",
      en: "Fire-alarm requirements under review — verifying source bounds...",
    },
    composition: {
      ar: "أوجّه إلى الـ PDF الرسمي لأن الفقرة 907 ليست في V4...",
      en: "Pointing to official PDF since Section 907 is not in V4...",
    },
  },

  fire_pump: {
    routing: {
      ar: "أربط ارتفاع المبنى وضغط التغذية بمتطلب مضخة الحريق...",
      en: "Linking building height and supply pressure to fire-pump requirement...",
    },
    inputs_check: {
      ar: "أراجع الارتفاع والضغط المطلوب قبل تحديد المضخة...",
      en: "Reviewing height and required pressure before specifying the pump...",
    },
    parking_lot_notice: {
      ar: "متطلبات مضخة الحريق قيد المراجعة — لا أنشر تقدير غير مدعوم...",
      en: "Fire-pump requirements under review — not publishing unsupported estimates...",
    },
    composition: {
      ar: "أوجّه إلى المرجع الرسمي لأن الفقرة 913 ليست في V4...",
      en: "Pointing to official reference since Section 913 is not in V4...",
    },
  },

  standpipe: {
    routing: {
      ar: "أحدّد فئة الـ standpipe من ارتفاع المبنى ووصول الإطفاء...",
      en: "Identifying standpipe class from building height and fire access...",
    },
    inputs_check: {
      ar: "أراجع ارتفاع المبنى لتحديد الفئة المطلوبة...",
      en: "Reviewing building height to determine the required class...",
    },
    parking_lot_notice: {
      ar: "متطلبات الـ standpipe قيد المراجعة — أتحقق من حدود المصدر...",
      en: "Standpipe requirements under review — verifying source bounds...",
    },
    composition: {
      ar: "أوجّه إلى الـ PDF الرسمي لأن الفقرة 905 ليست في V4...",
      en: "Pointing to official PDF since Section 905 is not in V4...",
    },
  },

  smoke_control: {
    routing: {
      ar: "أحدّد طريقة التحكم بالدخان من الإشغال ووجود الـ atrium...",
      en: "Identifying smoke-control method from occupancy and atrium presence...",
    },
    inputs_check: {
      ar: "أراجع الإشغال ووجود الأتريوم قبل تطبيق متطلبات الدخان...",
      en: "Reviewing occupancy and atrium presence before applying smoke requirements...",
    },
    parking_lot_notice: {
      ar: "متطلبات التحكم بالدخان قيد المراجعة — لا أنشر تقدير غير مدعوم...",
      en: "Smoke-control requirements under review — not publishing unsupported estimates...",
    },
    composition: {
      ar: "أوجّه إلى الـ PDF الرسمي لأن الفقرة 909 ليست في V4...",
      en: "Pointing to official PDF since Section 909 is not in V4...",
    },
  },

  general_code_lookup: {
    routing: {
      ar: "أحدّد الجدول أو الفقرة المرتبطة وأتحقق من مصدرها...",
      en: "Identifying the related section or table and verifying its source...",
    },
    retrieval: {
      ar: "أحضر الفقرات الداعمة من الكود السعودي...",
      en: "Pulling supporting paragraphs from the Saudi Code...",
    },
    composition: {
      ar: "أطابق رقم الجدول مع الفقرة الداعمة قبل عرض النص...",
      en: "Matching table number with supporting paragraph before presenting text...",
    },
  },

  non_code: {
    composition: {
      ar: "أستعدّ للرد على سؤالك...",
      en: "Preparing to respond...",
    },
  },
};

// ── Get event for a given domain + phase ─────────────────────────────────────

export function getThinkingEvent(
  domain: WorkflowDomain | "non_code" | "general_code_lookup",
  phase: ThinkingPhase,
  language: "ar" | "en",
): ThinkingEvent | null {
  if (!isDynamicThinkingEnabled()) return null;

  const domainMsgs = MESSAGES[domain];
  if (!domainMsgs) return null;

  const msg = domainMsgs[phase];
  if (!msg) return null;

  return { phase, ar: msg.ar, en: msg.en };
}

// ── Build sequence of events for a full query ─────────────────────────────────
// Returns ordered events to emit during the pipeline.

export function buildThinkingSequence(
  routerResult: RouterResult | null,
  hasMissingInputs: boolean,
  hasParkingLotHit: boolean,
  language: "ar" | "en",
): ThinkingEvent[] {
  if (!isDynamicThinkingEnabled()) return [];
  if (!routerResult) return [];

  const domain = routerResult.domain as WorkflowDomain | "non_code" | "general_code_lookup";
  const events: ThinkingEvent[] = [];

  // 1. Routing event (always first)
  const routing = getThinkingEvent(domain, "routing", language);
  if (routing) events.push(routing);

  // 2. Inputs check (only if missing inputs detected)
  if (hasMissingInputs) {
    const inputsCheck = getThinkingEvent(domain, "inputs_check", language);
    if (inputsCheck) events.push(inputsCheck);
  }

  // 3. Retrieval (for code-domain queries)
  if (domain !== "non_code") {
    const retrieval = getThinkingEvent(domain, "retrieval", language);
    if (retrieval) events.push(retrieval);
  }

  // 4. Parking-lot notice (if query hits a parking-lot ref)
  if (hasParkingLotHit) {
    const parkingLot = getThinkingEvent(domain, "parking_lot_notice", language);
    if (parkingLot) events.push(parkingLot);
  }

  // 5. Composition (always last)
  const composition = getThinkingEvent(domain, "composition", language);
  if (composition) events.push(composition);

  return events;
}

// ── Format event for SSE emission ─────────────────────────────────────────────
// Returns the display text for the thinking status line.

export function formatThinkingEvent(
  event: ThinkingEvent,
  language: "ar" | "en",
): string {
  return language === "ar" ? event.ar : event.en;
}

// ── Forbidden static phrases that B2 replaces ────────────────────────────────
// Reference only — used in tests to verify old strings are not emitted when flag is ON.

export const FORBIDDEN_STATIC_PHRASES_AR = [
  "جاري البحث بالمصادر",
  "يجري التحليل",
  "يجري كتابة التقرير",
  "جاري استخلاص حقائق التصميم والاشتراطات",
  "جاري تحليل معمّق، يرجى الانتظار",
  "جاري التفكير",
];

export const FORBIDDEN_STATIC_PHRASES_EN = [
  "Extracting design facts and requirements",
  "Deep analysis in progress",
  "Thinking...",
  "Checking compliance against SBC",
];
