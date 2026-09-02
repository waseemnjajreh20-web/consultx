/**
 * buildingProfile.ts — pure, framework-free module for the Building Profile
 * feature (C1a, 2026-09-03). No React, no Supabase client, no side effects —
 * safe to import from tests, the browser, or (in principle) an edge function.
 *
 * A BuildingProfile mirrors docs/db/20260903_building_profiles.sql. It is a
 * bag of USER-PROVIDED FACTS about one building, optionally attached to a
 * conversation, used to (a) give the assistant computation context and
 * (b) drive src/lib/complianceReport.ts. It is explicitly NOT a code source:
 * profileToPromptBlock() below labels it as such and it must never be routed
 * through the citation-token pipeline (src/utils/inlineCitation.ts) or cited
 * as [SBC-XXX ...].
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums (must match the CHECK constraints in the SQL doc exactly)
// ─────────────────────────────────────────────────────────────────────────────

export const OCCUPANCY_GROUPS = [
  "A-1", "A-2", "A-3", "A-4", "A-5",
  "B",
  "E",
  "F-1", "F-2",
  "H-1", "H-2", "H-3", "H-4", "H-5",
  "I-1", "I-2", "I-3", "I-4",
  "M",
  "R-1", "R-2", "R-3", "R-4",
  "S-1", "S-2",
  "U",
] as const;
export type OccupancyGroup = (typeof OCCUPANCY_GROUPS)[number];

export const CONSTRUCTION_TYPES = [
  "I-A", "I-B", "II-A", "II-B", "III-A", "III-B", "IV", "V-A", "V-B",
] as const;
export type ConstructionType = (typeof CONSTRUCTION_TYPES)[number];

export function isOccupancyGroup(value: unknown): value is OccupancyGroup {
  return typeof value === "string" && (OCCUPANCY_GROUPS as readonly string[]).includes(value);
}
export function isConstructionType(value: unknown): value is ConstructionType {
  return typeof value === "string" && (CONSTRUCTION_TYPES as readonly string[]).includes(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildingProfile {
  id: string;
  user_id: string;
  conversation_id: string | null;
  name: string;
  occupancy_group: OccupancyGroup | null;
  stories: number | null;
  height_m: number | null;
  gross_area_m2: number | null;
  sprinklered: boolean | null;
  construction_type: ConstructionType | null;
  hazard_class: string | null;
  occupant_load: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** The editable subset — everything except server-assigned/identity columns. */
export type BuildingProfileInput = Partial<
  Pick<
    BuildingProfile,
    | "conversation_id"
    | "name"
    | "occupancy_group"
    | "stories"
    | "height_m"
    | "gross_area_m2"
    | "sprinklered"
    | "construction_type"
    | "hazard_class"
    | "occupant_load"
    | "notes"
  >
>;

export interface ValidationResult {
  ok: boolean;
  /** Arabic user-facing messages — this UI is Arabic-by-default (CLAUDE.md). */
  errors: string[];
  /** Normalized/coerced value: trimmed strings, only the fields that passed. */
  value: BuildingProfileInput;
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_NAME_LEN = 200;
const MAX_NOTES_LEN = 4000;
const MAX_HAZARD_LEN = 200;
const MAX_STORIES = 300;
const MAX_HEIGHT_M = 1200;
const MAX_AREA_M2 = 5_000_000;
const MAX_OCCUPANT_LOAD = 500_000;

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate (and normalize) a partial profile edit. Every field is optional —
 * this validates whatever the caller passed, so it works for both "create"
 * and "patch" forms. Unknown/invalid enum values and out-of-range numbers are
 * rejected with an Arabic message; valid fields are copied (trimmed where
 * relevant) into `value`.
 */
export function validateBuildingProfile(input: BuildingProfileInput | null | undefined): ValidationResult {
  const errors: string[] = [];
  const value: BuildingProfileInput = {};
  const src = input ?? {};

  if (src.name !== undefined) {
    const name = String(src.name ?? "").trim();
    if (name.length > MAX_NAME_LEN) {
      errors.push(`اسم المبنى طويل جداً (الحد الأقصى ${MAX_NAME_LEN} حرفاً).`);
    } else {
      value.name = name;
    }
  }

  if (src.conversation_id !== undefined && src.conversation_id !== null) {
    if (!UUID_RX.test(String(src.conversation_id))) {
      errors.push("معرّف المحادثة غير صالح.");
    } else {
      value.conversation_id = src.conversation_id;
    }
  } else if (src.conversation_id === null) {
    value.conversation_id = null;
  }

  if (src.occupancy_group !== undefined && src.occupancy_group !== null) {
    if (!isOccupancyGroup(src.occupancy_group)) {
      errors.push(
        `تصنيف الإشغال "${src.occupancy_group}" غير معروف. القيم المسموحة حسب كود البناء السعودي SBC 201: ${OCCUPANCY_GROUPS.join("، ")}.`,
      );
    } else {
      value.occupancy_group = src.occupancy_group;
    }
  } else if (src.occupancy_group === null) {
    value.occupancy_group = null;
  }

  if (src.construction_type !== undefined && src.construction_type !== null) {
    if (!isConstructionType(src.construction_type)) {
      errors.push(
        `نوع الإنشاء "${src.construction_type}" غير معروف. القيم المسموحة: ${CONSTRUCTION_TYPES.join("، ")}.`,
      );
    } else {
      value.construction_type = src.construction_type;
    }
  } else if (src.construction_type === null) {
    value.construction_type = null;
  }

  if (src.stories !== undefined && src.stories !== null) {
    const n = src.stories;
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      errors.push("عدد الطوابق يجب أن يكون عدداً صحيحاً أكبر من أو يساوي صفر.");
    } else if (n > MAX_STORIES) {
      errors.push(`عدد الطوابق غير واقعي (أكبر من ${MAX_STORIES}).`);
    } else {
      value.stories = n;
    }
  } else if (src.stories === null) {
    value.stories = null;
  }

  if (src.height_m !== undefined && src.height_m !== null) {
    const n = src.height_m;
    if (!Number.isFinite(n) || n < 0) {
      errors.push("ارتفاع المبنى يجب أن يكون رقماً أكبر من أو يساوي صفر.");
    } else if (n > MAX_HEIGHT_M) {
      errors.push(`ارتفاع المبنى غير واقعي (أكبر من ${MAX_HEIGHT_M} م).`);
    } else {
      value.height_m = n;
    }
  } else if (src.height_m === null) {
    value.height_m = null;
  }

  if (src.gross_area_m2 !== undefined && src.gross_area_m2 !== null) {
    const n = src.gross_area_m2;
    if (!Number.isFinite(n) || n < 0) {
      errors.push("المساحة الإجمالية يجب أن تكون رقماً أكبر من أو يساوي صفر.");
    } else if (n > MAX_AREA_M2) {
      errors.push("المساحة الإجمالية غير واقعية.");
    } else {
      value.gross_area_m2 = n;
    }
  } else if (src.gross_area_m2 === null) {
    value.gross_area_m2 = null;
  }

  if (src.occupant_load !== undefined && src.occupant_load !== null) {
    const n = src.occupant_load;
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      errors.push("عدد الشاغلين المصمَّم يجب أن يكون عدداً صحيحاً أكبر من أو يساوي صفر.");
    } else if (n > MAX_OCCUPANT_LOAD) {
      errors.push("عدد الشاغلين المصمَّم غير واقعي.");
    } else {
      value.occupant_load = n;
    }
  } else if (src.occupant_load === null) {
    value.occupant_load = null;
  }

  if (src.sprinklered !== undefined) {
    value.sprinklered = src.sprinklered === null ? null : Boolean(src.sprinklered);
  }

  if (src.hazard_class !== undefined && src.hazard_class !== null) {
    const h = String(src.hazard_class).trim();
    if (h.length > MAX_HAZARD_LEN) {
      errors.push(`تصنيف الخطورة طويل جداً (الحد الأقصى ${MAX_HAZARD_LEN} حرفاً).`);
    } else {
      value.hazard_class = h;
    }
  } else if (src.hazard_class === null) {
    value.hazard_class = null;
  }

  if (src.notes !== undefined) {
    const notes = String(src.notes ?? "").trim();
    if (notes.length > MAX_NOTES_LEN) {
      errors.push(`الملاحظات طويلة جداً (الحد الأقصى ${MAX_NOTES_LEN} حرفاً).`);
    } else {
      value.notes = notes;
    }
  }

  return { ok: errors.length === 0, errors, value };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt block — explicitly NOT a code source
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, { ar: string; en: string }> = {
  name: { ar: "الاسم", en: "Name" },
  occupancy_group: { ar: "تصنيف الإشغال", en: "Occupancy group" },
  stories: { ar: "عدد الطوابق", en: "Stories" },
  height_m: { ar: "الارتفاع", en: "Height" },
  gross_area_m2: { ar: "المساحة الإجمالية", en: "Gross area" },
  sprinklers: { ar: "مرشات الحريق", en: "Sprinklers" },
  construction_type: { ar: "نوع الإنشاء", en: "Construction type" },
  hazard_class: { ar: "تصنيف الخطورة", en: "Hazard classification" },
  occupant_load: { ar: "عدد الشاغلين المصمَّم", en: "Design occupant load" },
  notes: { ar: "ملاحظات", en: "Notes" },
};

/**
 * Render a profile as a labelled "معطيات المبنى" (Building data) system-prompt
 * block. This is BACKGROUND CONTEXT for computing an answer, never a code
 * source — the header says so explicitly in both languages, matching the
 * pattern used for user_memory (see supabase/functions/fire-safety-chat
 * /index.ts, "One compact document per user ... BACKGROUND PERSONALISATION
 * context, never a code source"). Callers must inject this as its own system
 * block, never mixed into retrieved SBC context, and never fed to the
 * citation-token parser (src/utils/inlineCitation.ts) — see
 * docs/launch/building-profile-notes.md for the wiring plan.
 *
 * Returns "" when the profile has no meaningful fields set, so callers can
 * skip injecting an empty block.
 */
export function profileToPromptBlock(
  profile: Partial<BuildingProfile> | null | undefined,
  language: "ar" | "en" = "ar",
): string {
  if (!profile) return "";
  const isAr = language !== "en";
  const lines: string[] = [];

  const label = (key: keyof typeof FIELD_LABELS) => (isAr ? FIELD_LABELS[key].ar : FIELD_LABELS[key].en);

  if (profile.name && profile.name.trim()) {
    lines.push(`${label("name")}: ${profile.name.trim()}`);
  }
  if (profile.occupancy_group) {
    lines.push(`${label("occupancy_group")}: ${profile.occupancy_group}`);
  }
  if (profile.stories !== null && profile.stories !== undefined) {
    lines.push(`${label("stories")}: ${profile.stories}`);
  }
  if (profile.height_m !== null && profile.height_m !== undefined) {
    lines.push(`${label("height_m")}: ${profile.height_m} ${isAr ? "م" : "m"}`);
  }
  if (profile.gross_area_m2 !== null && profile.gross_area_m2 !== undefined) {
    lines.push(`${label("gross_area_m2")}: ${profile.gross_area_m2} ${isAr ? "م²" : "m²"}`);
  }
  if (profile.sprinklered !== null && profile.sprinklered !== undefined) {
    const v = profile.sprinklered
      ? (isAr ? "مرشات مركّبة" : "sprinklered")
      : (isAr ? "لا توجد مرشات" : "not sprinklered");
    lines.push(`${label("sprinklers")}: ${v}`);
  }
  if (profile.construction_type) {
    lines.push(`${label("construction_type")}: ${profile.construction_type}`);
  }
  if (profile.hazard_class && profile.hazard_class.trim()) {
    lines.push(`${label("hazard_class")}: ${profile.hazard_class.trim()}`);
  }
  if (profile.occupant_load !== null && profile.occupant_load !== undefined) {
    lines.push(`${label("occupant_load")}: ${profile.occupant_load}`);
  }
  if (profile.notes && profile.notes.trim()) {
    lines.push(`${label("notes")}: ${profile.notes.trim()}`);
  }

  if (lines.length === 0) return "";

  const header = isAr
    ? "معطيات المبنى (من إدخال المستخدم — ليست نصاً من الكود ولا يجوز الاستشهاد بها كمصدر نظامي؛ استخدمها فقط كسياق لحساب الإجابة):"
    : "Building data (user-provided facts — NOT a code source; never cite this block as an authority. Use it only as context for computing the answer):";

  return [header, ...lines].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Completeness
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileCompleteness {
  /** 0..1 */
  score: number;
  /** Arabic labels of the core fields still missing. */
  missing: string[];
}

/**
 * Score how complete a profile is against the fields the code typically
 * needs to answer a fire-safety question: occupancy, stories-or-height,
 * area, sprinklered, construction type. "Stories or height" counts as ONE
 * slot, satisfied by either field.
 */
export function profileCompleteness(profile: Partial<BuildingProfile> | null | undefined): ProfileCompleteness {
  const p = profile ?? {};
  const checks: Array<{ label: string; present: boolean }> = [
    { label: "تصنيف الإشغال", present: !!p.occupancy_group },
    {
      label: "عدد الطوابق أو الارتفاع",
      present: (p.stories !== null && p.stories !== undefined) || (p.height_m !== null && p.height_m !== undefined),
    },
    { label: "المساحة الإجمالية", present: p.gross_area_m2 !== null && p.gross_area_m2 !== undefined },
    { label: "مرشات الحريق", present: p.sprinklered !== null && p.sprinklered !== undefined },
    { label: "نوع الإنشاء", present: !!p.construction_type },
  ];
  const missing = checks.filter((c) => !c.present).map((c) => c.label);
  const score = (checks.length - missing.length) / checks.length;
  return { score, missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// Conservative extractor — never guesses beyond explicit mentions
// ─────────────────────────────────────────────────────────────────────────────

/** Arabic-Indic / Extended-Arabic-Indic digits → Western digits. */
function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return String(code - 0x06f0);
  });
}

// NOTE on \b after Arabic text: JS regex `\b` is defined purely in terms of
// the ASCII `\w` class ([A-Za-z0-9_]) — Arabic letters (and Arabic-Indic
// digits/punctuation) are NOT `\w`, so a position right after an Arabic
// character is "non-word | non-word" and `\b` silently never matches there.
// A trailing `\b(?:طابق|...)\b`-style guard would therefore make these
// regexes never match real Arabic sentences. AR_END below is a
// Unicode-range-aware replacement: it only asserts "not immediately
// followed by a Latin/Arabic letter or digit" (via a lookahead, which does
// not care what precedes it), which is the actual boundary we want. English
// (Latin-script) alternatives keep using plain `\b`, which is correct there.
const AR_END = "(?![A-Za-z0-9\\u0600-\\u06FF])";

const STORIES_RX_AR = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:طابق|طوابق|دور|أدوار)${AR_END}`);
const STORIES_RX_EN = /\b(\d+(?:\.\d+)?)\s*(?:floors?|storeys?|stories|story)\b/i;

const HEIGHT_RX_AR = new RegExp(`ارتفاع(?:ه)?(?:\\s+ال?مبنى)?\\s*[:\\-]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:م|متر)${AR_END}`);
const HEIGHT_RX_EN_1 = /height\s*(?:of)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*m(?:eters?)?\b/i;
const HEIGHT_RX_EN_2 = /(\d+(?:\.\d+)?)\s*m(?:eters?)?\s+(?:tall|high)\b/i;

const AREA_RX_AR = new RegExp(
  `مساحة(?:ه)?(?:\\s+ال?مبنى)?\\s*(?:الإجمالية)?\\s*[:\\-]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:م٢|م2|م²|متر\\s*مربع)${AR_END}`,
);
const AREA_RX_EN = /area\s*(?:of)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:m²|m2|sq\.?\s*m|sqm|square\s+meters?)\b/i;

const OCCUPANT_LOAD_RX_AR = /(?:معدل\s+الإشغال|عدد\s+الشاغلين)\s*[:\-]?\s*(\d+)/;
const OCCUPANT_LOAD_RX_EN = /occupant\s+load\s*[:\-]?\s*(\d+)/i;

const SPRINKLER_NEGATIVE_RX_AR = /(?:بدون|لا\s+يوجد|غير\s+مزود\s*ب|خالٍ?\s+من)\s*(?:نظام\s+)?مرشات/;
const SPRINKLER_POSITIVE_RX_AR = /مرشات/;
const SPRINKLER_NEGATIVE_RX_EN = /\b(?:no|not|without)\b[^.\n]{0,20}\bsprinkler(?:ed|s)?\b/i;
const SPRINKLER_POSITIVE_RX_EN = /\bsprinkler(?:ed|s)?\b/i;

const CONSTRUCTION_TYPE_RX =
  /(?:نوع\s+الإنشاء|construction\s+type|type)\s*[:\-]?\s*(I-A|I-B|II-A|II-B|III-A|III-B|IV|V-A|V-B)\b/i;

/**
 * Modest, explicitly-documented keyword → occupancy-group map. Only fires on
 * a recognizable phrase; a bare/ambiguous mention that doesn't match one of
 * these is left unset rather than guessed. "مبنى سكني" / "residential
 * building" with no further qualifier defaults to R-2 (multi-unit apartment
 * building) — the common reading of "مبنى" (a multi-story building) as
 * opposed to "فيلا"/"منزل" (a standalone house, R-3). Review with وسيم before
 * relying on this default for anything beyond a starting suggestion.
 */
const OCCUPANCY_KEYWORDS: Array<{ rx: RegExp; group: OccupancyGroup; genericResidential?: boolean }> = [
  { rx: /فندق|نزل|hotel|motel/i, group: "R-1" },
  { rx: /شقق\s*سكنية|عمارة\s*سكنية|مجمع\s*سكني|apartment(?:s)?|multi-?family/i, group: "R-2" },
  { rx: /فيلا|دوبلكس|منزل\s*عائلي|villa|duplex|single-?family|townhouse/i, group: "R-3" },
  // generic residential — documented default above; suppressed by
  // OCCUPANCY_NEGATION_RX below (e.g. "غير سكني" / "non-residential") so a
  // negated mention never produces a false-positive R-2 guess.
  { rx: /مبنى\s*سكني|سكني|residential/i, group: "R-2", genericResidential: true },
  { rx: /مستشفى|hospital/i, group: "I-2" },
  { rx: /مستودع|warehouse/i, group: "S-1" },
  { rx: /مدرسة|تعليمي|school|educational/i, group: "E" },
  { rx: /مكتب|إداري|office/i, group: "B" },
  { rx: /تجاري|محل|سوق|retail|mercantile/i, group: "M" },
];

/** Guards the generic "سكني/residential" fallback against an explicit negation. */
const OCCUPANCY_NEGATION_RX = /non-residential|غير\s+سكني|ليس\s+سكني/i;

/**
 * Conservative regex-based suggestion extractor. Only extracts a field when
 * an explicit, unambiguous marker is present (a number next to an explicit
 * unit word, an explicit anchor phrase before a number, or a recognizable
 * occupancy/sprinkler keyword) — never from a bare number or generic prose.
 * Intended as a "اقتراح من المحادثة" starting point the user reviews and
 * edits, never auto-applied silently.
 */
export function suggestProfileFromText(text: string | null | undefined): Partial<BuildingProfile> {
  const result: Partial<BuildingProfile> = {};
  if (!text) return result;
  const raw = String(text).slice(0, 5000);
  const t = normalizeDigits(raw);

  const storiesMatch = t.match(STORIES_RX_AR) ?? t.match(STORIES_RX_EN);
  if (storiesMatch) {
    const n = parseFloat(storiesMatch[1].replace(",", "."));
    if (Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= MAX_STORIES) {
      result.stories = n;
    }
  }

  const heightMatch = t.match(HEIGHT_RX_AR) ?? t.match(HEIGHT_RX_EN_1) ?? t.match(HEIGHT_RX_EN_2);
  if (heightMatch) {
    const n = parseFloat(heightMatch[1].replace(",", "."));
    if (Number.isFinite(n) && n >= 0 && n <= MAX_HEIGHT_M) {
      result.height_m = n;
    }
  }

  const areaMatch = t.match(AREA_RX_AR) ?? t.match(AREA_RX_EN);
  if (areaMatch) {
    const n = parseFloat(areaMatch[1].replace(",", "."));
    if (Number.isFinite(n) && n >= 0 && n <= MAX_AREA_M2) {
      result.gross_area_m2 = n;
    }
  }

  const occLoadMatch = t.match(OCCUPANT_LOAD_RX_AR) ?? t.match(OCCUPANT_LOAD_RX_EN);
  if (occLoadMatch) {
    const n = parseInt(occLoadMatch[1], 10);
    if (Number.isFinite(n) && n >= 0 && n <= MAX_OCCUPANT_LOAD) {
      result.occupant_load = n;
    }
  }

  if (SPRINKLER_NEGATIVE_RX_AR.test(t) || SPRINKLER_NEGATIVE_RX_EN.test(t)) {
    result.sprinklered = false;
  } else if (SPRINKLER_POSITIVE_RX_AR.test(t) || SPRINKLER_POSITIVE_RX_EN.test(t)) {
    result.sprinklered = true;
  }

  const ctMatch = t.match(CONSTRUCTION_TYPE_RX);
  if (ctMatch && isConstructionType(ctMatch[1].toUpperCase())) {
    result.construction_type = ctMatch[1].toUpperCase() as ConstructionType;
  }

  const negatedResidential = OCCUPANCY_NEGATION_RX.test(t);
  for (const { rx, group, genericResidential } of OCCUPANCY_KEYWORDS) {
    if (genericResidential && negatedResidential) continue;
    if (rx.test(t)) {
      result.occupancy_group = group;
      break;
    }
  }

  return result;
}
