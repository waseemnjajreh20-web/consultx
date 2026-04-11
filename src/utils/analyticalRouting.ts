/**
 * analyticalRouting.ts
 *
 * Pure TypeScript mirror of the extractTableIds() function in the Deno edge
 * function (supabase/functions/fire-safety-chat/index.ts).
 *
 * KEEP IN SYNC: When KNOWN_TABLE_IDS, PARENT_ALIASES, or SEMANTIC_ALIASES
 * change in the edge function, apply the same changes here so the regression
 * tests remain valid. The two copies are intentional (Deno vs Node split).
 *
 * Regex note:
 *   \b word boundaries only work for ASCII [0-9A-Za-z_] in JS regex.
 *   Arabic Unicode chars are NOT ASCII word chars, so \b before/after Arabic
 *   text never fires. All outer \b wrappers are therefore omitted from
 *   SEMANTIC_ALIASES. Individual English alternatives use \b where helpful
 *   (start-of-word anchor, full-word patterns). Patterns are specific enough
 *   (2+ words / distinctive phrases) that false positives are negligible.
 *
 *   Parent alias expansion guard removed: when a parent section is matched we
 *   always add all children unconditionally. Set deduplication prevents
 *   duplicates in the output.
 */

// ── Exported alias maps (also exposed for direct testing) ──────────────────

export const KNOWN_TABLE_IDS: ReadonlyArray<string> = [
  // Chapter 3 — Occupancy Classification
  "302", "303", "304", "305", "306", "307", "308", "309", "310", "311", "312",
  // Chapter 4 — Special Detailed Requirements
  "402", "403.1", "404", "405", "406.5", "406.6", "407", "408", "414", "415", "420",
  // Chapter 5 — Heights, Areas, Mixed Occupancy, Incidental Uses
  "504.3", "504.4", "506.2", "508", "508.3", "508.4", "508.5", "509",
  // Chapter 6 — Construction Types
  "601", "602",
  // Chapter 7 — Fire & Smoke Protection
  "705.8",
  // Chapter 10 — Means of Egress
  "1004.5", "1005.1", "1006.2.1", "1006.3.3", "1006.3.4",
  "1008", "1009", "1010", "1011.2", "1012", "1013", "1015",
  "1017.2", "1018.1", "1020.1", "1021.2", "1024", "1029.6.3", "1030",
  // SBC 801 Chapter 9 — Fire Protection Systems
  "903.2", "903.3.1", "903.3.2", "903.4", "903.4.3",
  "905.3.1",
  "907.2", "907.3", "907.4.2", "907.5", "907.6",
  "909", "912", "913", "914", "915",
] as const;

export const PARENT_ALIASES: Readonly<Record<string, string[]>> = {
  // Chapter 3 — Occupancy Classification parents
  "303":    ["303"],
  "304":    ["304"],
  "305":    ["305"],
  "306":    ["306"],
  "307":    ["307"],
  "308":    ["308"],
  "309":    ["309"],
  "310":    ["310"],
  "311":    ["311"],
  "312":    ["312"],
  // Chapter 4 — Special Detailed Requirements parents
  "402":    ["402"],
  "403":    ["403.1"],
  "404":    ["404"],
  "405":    ["405"],
  "406":    ["406.5", "406.6"],
  "407":    ["407"],
  "408":    ["408"],
  "414":    ["414"],
  "415":    ["415"],
  "420":    ["420"],
  // Chapter 5 — Mixed occupancy parent
  "508":    ["508", "508.3", "508.4", "508.5"],
  // Chapter 10 — Egress parents
  "1005":   ["1005.1"],
  "1006":   ["1006.2.1", "1006.3.3", "1006.3.4"],
  "1011":   ["1011.2"],
  "1017":   ["1017.2"],
  "1018":   ["1018.1"],
  "1020":   ["1020.1"],
  "1021":   ["1021.2"],
  "1029":   ["1029.6.3"],
  // SBC 801 Ch. 9 parents
  "903":    ["903.2", "903.3.1", "903.3.2"],
  "903.4":  ["903.4", "903.4.3"],
  "905":    ["905.3.1"],
  "907":    ["907.2", "907.3"],
  "907.4":  ["907.4.2"],
};

// Semantic aliases: [regex, tableIds[]]
// Regex design rules:
//   1. No outer \b wrappers (Arabic Unicode breaks \b; patterns are specific enough)
//   2. Use \b only at pattern start for English single-word anchors where helpful
//   3. Use \w* to absorb word suffixes where trailing \b would fail on prefixes
//   4. sprinkler → sprinklers? to handle plural
export const SEMANTIC_ALIASES: ReadonlyArray<[RegExp, string[]]> = [

  // ── CHAPTER 3 — Occupancy Classification ─────────────────────────────────
  [/occupancy\s+classif|تصنيف\s+الإشغال|كيف\s+أصنف|أي\s+إشغال/i,                    ["302"]],
  [/what\s+(?:group|occupancy)\s+is|ما\s+(?:تصنيف|مجموعة)\s+إشغال/i,                 ["302"]],
  // Assembly — covers "assembly occupancy", "A-2 assembly", "assembly group", restaurant/café
  [/assembly\s+(?:occup\w*|group\w*|A-[1-5])|A-[1-5]\s+(?:occup\w*|assembly)|\brestaurant\b|\bcafé?\b|مجموعة\s+(?:التجمع|أ)|مبنى\s+تجمع|مطعم/i, ["303"]],
  // Business — offices, Group B, "مكاتب إدارية"
  [/business\s+occup\w*|\bGroup\s+B\b|open.plan\s+office|office\s+(?:building|floor|space|occup\w*)|مكاتب\s+(?:إدارية|تجارية)|مجموعة\s+ب\b/i, ["304"]],
  // Educational — schools, Group E
  [/educational\s+occup\w*|\bGroup\s+E\b|school\s+(?:occup\w*|build\w*)|مبنى\s+(?:تعليمي|مدرسي)|مجموعة\s+(?:التعليم|هـ)\b|مدارس/i, ["305"]],
  // Factory — Group F
  [/factory\s+occup\w*|\bGroup\s+F[12]?\b|F-[12]\s+(?:hazard|occup\w*)|مصنع\s+إشغال\w*|مجموعة\s+F\b/i, ["306"]],
  // High-hazard — Group H
  [/high.hazard\s+occup\w*|\bGroup\s+H[1-5]?\b|H-[1-5]\s+(?:class|occup\w*)|مخزن\s+خطر|مجموعة\s+H\b/i, ["307", "415"]],
  // Institutional — Group I, healthcare
  [/institutional\s+occup\w*|\bGroup\s+I[1-4]?\b|I-[1-4]\s+(?:class|occup\w*|group)|مستشفى\s+إشغال|مجموعة\s+I\b/i, ["308"]],
  // Mercantile — retail, Group M, "محلات تجارية"
  [/mercantile\s+occup\w*|\bGroup\s+M\b|retail\s+(?:shop\w*|store\w*|occup\w*|space\w*)|محلات\s+تجارية|مجموعة\s+(?:M|التجزئة)\b/i, ["309"]],
  // Residential — Group R, apartments, مبنى سكني
  [/residential\s+occup\w*|\bGroup\s+R[1-4]?\b|R-[1-4]\s+(?:class|occup\w*)|سكني\s+إشغال|مبنى\s+سكني|مجموعة\s+(?:R|السكني)\b/i, ["310"]],
  // Storage — Group S, warehouse
  [/storage\s+occup\w*|\bGroup\s+S[12]?\b|S-[12]\s+(?:class|occup\w*)|مستودع\s+إشغال|مجموعة\s+(?:S|التخزين)\b/i, ["311"]],
  // Utility — Group U
  [/utility\s+occup\w*|\bGroup\s+U\b|miscellaneous\s+occup\w*|مجموعة\s+(?:U|المرافق)\b/i, ["312"]],

  // ── CHAPTER 4 — Special Use / Detailed Requirements ───────────────────────
  [/covered\s+mall|open\s+mall|mall\s+building|مول\s+تجاري|مبنى\s+مول/i,             ["402"]],
  // High-rise — English and Arabic forms, plus height in meters (>16 m)
  [/high.rise|high\s+rise|مبنى\s+شاهق|المباني\s+الشاهقة|شاهق|55\s*(?:ft|feet|قدم)/i, ["403.1"]],
  [/fire\s+command\s+center|مركز\s+قيادة\s+الحرائق|emergency\s+power\s+(?:high|building)/i, ["403.1"]],
  [/atrium|أتريوم|فناء\s+داخلي|بهو\s+(?:متعدد|مفتوح)/i,                              ["404"]],
  [/underground\s+(?:building|structure|level)|below.grade\s+(?:floor|level)|subterranean|تحت\s+الأرض|طابق\s+سفلي/i, ["405"]],
  [/open\s+parking|parking\s+(?:garage|structure)|مواقف\s+(?:السيارات\s+المفتوحة|مفتوحة)/i, ["406.5"]],
  [/enclosed\s+parking|covered\s+parking|مواقف\s+(?:السيارات\s+المغلقة|مغلقة|مغطاة)/i,  ["406.6"]],
  [/parking\s+sprinkler|sprinkler.*parking|رشاشات\s+مواقف|مواقف.*رشاشات/i,             ["406.5", "406.6"]],
  [/healthcare\s+(?:building|facility|occup\w*)|I-2\s+(?:occup\w*|group)|hospital\s+(?:special|fire)|مستشفى\s+(?:اشتراطات|خاص)/i, ["407"]],
  [/detention|correctional\s+(?:facility|center)|I-3\s+(?:occup\w*|group)|prison\s+(?:fire|egress)|مرفق\s+احتجاز/i, ["408"]],
  [/hazardous\s+material|control\s+area|MAQ\s+|maximum\s+allowable\s+quantity|مواد\s+خطرة|كميات\s+المواد\s+الخطرة/i, ["414"]],
  [/Group\s+H\s+(?:special|provision|require\w*)|المتطلبات\s+الخاصة.*مجموعة\s+H/i,    ["415"]],
  [/sleeping\s+unit\s+(?:special|require\w*)|hotel\s+(?:special\s+provision|sleep)|R-[12]\s+sleeping|I-1\s+sleeping|وحدات\s+النوم\s+الخاصة/i, ["420"]],

  // ── CHAPTER 5 — Mixed Occupancy ───────────────────────────────────────────
  [/mixed\s+occup\w*|multiple\s+occup\w*|إشغال\s+مختلط|إشغالات\s+متعددة/i,           ["508", "508.3", "508.4", "508.5"]],
  [/accessory\s+occup\w*|10\s*%\s*(?:rule|area)|ملحق\s+الإشغال/i,                     ["508.3"]],
  [/nonseparated\s+occup\w*|most.restrictive\s+occup\w*|غير\s+مفصولة/i,               ["508.4"]],
  [/separated\s+occup\w*|fire.barrier\s+(?:between|separation)\s+occup\w*|إشغال\s+مفصول|فاصل\s+حريق\s+بين/i, ["508.5"]],

  // ── CHAPTER 6 — Construction Types ───────────────────────────────────────
  [/structural\s+frame\s+rating|fire.resist\w*\s+(?:hour|rating)|ساعات\s+مقاومة\s+الحريق/i, ["601"]],
  [/Type\s+(?:I{1,3}|IV|V)[A-B]|construction\s+type\s+(?:I|II|III|IV|V)|fireproof\w*|spray\s+fire/i, ["601"]],
  [/exterior\s+wall\s+(?:rating|fire)|fire\s+separation\s+distance|بُعد\s+الفصل/i,    ["602"]],

  // ── CHAPTER 7 — Exterior Wall Openings ───────────────────────────────────
  [/exterior\s+wall\s+opening\w*|window\s+(?:area|limit)|فتحات\s+الجدار/i,             ["705.8"]],

  // ── CHAPTER 10 — Means of Egress ─────────────────────────────────────────
  [/occupant\s+load|floor\s+area\s+per\s+occup\w*|حمل\s+الإشغال|عدد\s+الأشخاص\s+لكل/i, ["1004.5"]],
  [/egress\s+width|exit\s+width|stairway?\s+width\s+per|عرض\s+(?:المخرج|السلم)\s+لكل/i, ["1005.1"]],
  [/width\s+per\s+occup\w*|inches?\s+per\s+occup\w*|بوصة?\s+لكل\s+شخص/i,              ["1005.1"]],
  [/one\s+exit\s+(?:space|room|story)|single\s+exit|مخرج\s+واحد|جواز\s+مخرج\s+واحد/i, ["1006.2.1", "1006.3.3", "1006.3.4"]],
  [/emergency\s+lighting|emergency\s+illumin\w*|إضاءة\s+(?:ال)?(?:طوارئ|اضطرارية)|إنارة\s+(?:ال)?طوارئ/i, ["1008"]],
  [/egress\s+illumin\w*|means\s+of\s+egress\s+lighting|إضاءة\s+مسار\s+الهروب/i,       ["1008"]],
  [/accessible\s+(?:egress|means\s+of\s+egress)|area\s+of\s+refuge|مناطق\s+الملاذ|ملاذ\s+(?:آمن|حريق)|إخلاء\s+ذوي/i, ["1009"]],
  [/egress\s+door\w*|door\s+(?:hardware|latch|lock|panic|release)|panic\s+hardware|باب\s+المخرج|أبواب\s+(?:الطوارئ|الخروج)\s+(?:متطلبات|أجهزة)/i, ["1010"]],
  [/riser\s+height|tread\s+depth|stair\s+dimen\w*|headroom|ارتفاع\s+الدرجة|عمق\s+الدرجة/i, ["1011.2"]],
  [/stairway?\s+(?:min\w*|width|size)|أبعاد\s+(?:الدرج|السلم)/i,                       ["1011.2"]],
  [/handrail\s+(?:height|grip|require\w*|dimen\w*)|درابزين\s+(?:اليد|الحماية|ارتفاع|أبعاد)/i, ["1012"]],
  [/exit\s+sign\s+(?:require\w*|illumin\w*|location)|where\s+(?:are?\s+)?exit\s+signs?|لافتة\s+(?:المخرج|الخروج)|إشارات\s+المخرج/i, ["1013"]],
  [/guardrail?\s+(?:height|require\w*)|open\s+side\s+(?:stair|ramp|floor)|درابزين\s+الحماية/i, ["1015"]],
  [/travel\s+distance|مسافة\s+(?:السفر|الهروب|سفر)/i,                                 ["1017.2"]],
  [/max(?:imum)?\s+travel|أقصى\s+مسافة/i,                                             ["1017.2"]],
  [/corridor\s+(?:rating|fire|مقاومة)|ممر\s+مقاوم|unrated.*corridor|corridor.*unrat\w*/i, ["1020.1"]],
  [/min(?:imum)?\s+corridor\s+width|how\s+wide.*corridor|corridor.*how\s+wide|corridor.*width|width.*corridor|عرض\s+(?:ال)?ممر/i, ["1018.1"]],
  [/number\s+of\s+exits?|(?:عدد|كم)\s+(?:ال)?(?:مخارج|مخرج)|كم\s+عدد\s+(?:ال)?(?:مخارج|مخرج)/i, ["1021.2"]],
  [/min(?:imum)?\s+exits?|الحد\s+الأدنى\s+للمخارج/i,                                  ["1021.2"]],
  [/luminous\s+(?:egress|marking\w*|path)|photoluminescent|مسار\s+مضيء|علامات\s+مضيئة/i, ["1024"]],
  [/assembly\s+aisle\s+(?:width|access\w*)|aisle\s+accessway\s+(?:width|min\w*)|ممر\s+التجمع|عرض\s+الممر\s+المتقاطع/i, ["1029.6.3"]],
  [/emergency\s+escape\s+(?:opening|window)|rescue\s+opening|نافذة\s+الإنقاذ|فتحة\s+الطوارئ/i, ["1030"]],

  // ── SBC 801 CHAPTER 9 — Fire Protection Systems ──────────────────────────
  [/where\s+(?:are?\s+)?sprinklers?|when\s+(?:are?\s+)?sprinklers?|متى.*رشاش|الرشاشات.*إلزامي/i, ["903.2"]],
  [/sprinklers?\s+required|requires?\s+sprinklers?|تجب\s+الرشاشات?/i,                 ["903.2"]],
  [/are\s+sprinklers?\s+required|هل.*رشاشات|يحتاج.*رشاشات|الرشاشات.*إلزامية/i,        ["903.2"]],
  [/sprinkler.exempt|exempt.*sprinkler/i,                                              ["903.2"]],
  [/NFPA\s+13R|13R\s+sprinkler|residential\s+sprinkler\s+system|رشاشات\s+13R/i,        ["903.3.1"]],
  [/NFPA\s+13D|13D\s+sprinkler|one.two\s+family\s+sprinkler|رشاشات\s+13D/i,           ["903.3.2"]],
  [/sprinkler\s+(?:supervision|monitoring|alarm\s+valve)|alarm\s+valve|رشاشات.*إنذار|صمام\s+إنذار\s+الرشاشات/i, ["903.4"]],
  [/floor\s+control\s+valve|zone\s+control\s+valve|صمام\s+تحكم\s+الطابق/i,            ["903.4.3"]],
  [/standpipe\s+(?:where|required|class|system)|أنابيب\s+(?:الحريق|الإطفاء)\s+(?:متطلبات|أين)/i, ["905.3.1"]],
  [/fire\s+alarm\s+(?:where|required|system\s+required)|نظام\s+إنذار\s+حريق\s+(?:أين|متطلبات|إلزامي)|تستوجب\s+نظام\s+إنذار\s+حريق/i, ["907.2"]],
  [/smoke\s+detector\s+(?:where|required)|heat\s+detector\s+(?:where|required)|كاشف\s+دخان\s+(?:أين|متطلبات)/i, ["907.3"]],
  [/manual\s+pull\s+station|fire\s+alarm\s+initiating|زر\s+إنذار|بادئات\s+الإنذار/i,  ["907.4.2"]],
  [/notification\s+(?:appliance|device|requirement)|audible.*alarm|visible.*alarm|أجهزة\s+الإنذار\s+المرئية|أجهزة\s+الإخطار/i, ["907.5"]],
  [/fire\s+alarm\s+(?:monitor\w*|supervis\w*|connection\s+to\s+dispatch)|مراقبة\s+نظام\s+الإنذار/i, ["907.6"]],
  [/smoke\s+control\s+system|pressurization\s+system|نظام\s+التحكم\s+في\s+الدخان|ضغط\s+مسالك\s+الهروب/i, ["909"]],
  [/fire\s+department\s+connection|\bFDC\b|siamese\s+connection|وصلة\s+الدفاع\s+المدني/i, ["912"]],
  [/fire\s+pump\s+(?:where|required|sizing\w*)|مضخة\s+(?:حريق|إطفاء)\s+(?:متطلبات|أين)/i, ["913"]],
  [/emergency\s+responder\s+radio|radio\s+coverage|indoor\s+DAS|تغطية\s+راديو\s+الطوارئ/i, ["914"]],
  [/carbon\s+monoxide\s+(?:detector|alarm|CO)|\bCO\s+detection|أول\s+أكسيد\s+الكربون\s+(?:كاشف|إنذار)/i, ["915"]],
  // Incidental uses
  [/generator\s+room|boiler\s+room|incidental\s+use|fuel.fired\s+room|غرفة\s+(?:المولد|المرجل)/i, ["509"]],
  [/electrical\s+room\s+(?:separation|fire|rating)|storage\s+room\s+(?:separation|fire)|laundry\s+room\s+(?:separation|fire)/i, ["509"]],
  [/الاستخدامات\s+العرضية|غرفة\s+التخزين\s+(?:فصل|حريق)/i,                             ["509"]],
];

// ── Core routing function ──────────────────────────────────────────────────

/**
 * Extracts table IDs from a natural-language query.
 *
 * Returns a deduplicated array of IDs that should be fetched from
 * sbc_code_tables before answering the query.
 *
 * Matching order:
 *   1. Explicit "table XXXX" or "جدول XXXX" references
 *   2. Known bare section numbers appearing as standalone tokens
 *   3. Parent-section aliases (e.g. "section 903" → 903.2, 903.3.1, 903.3.2)
 *   4. Semantic aliases (natural-language patterns → table IDs)
 */
export function extractTableIds(query: string): string[] {
  const found = new Set<string>();
  const lower = query.toLowerCase();

  // Pass 1 — explicit "table XXXX" or "جدول XXXX"
  const tblRegex = /(?:table|جدول)\s+(\d{3,4}(?:\.\d{1,2}){0,2})/gi;
  let m: RegExpExecArray | null;
  while ((m = tblRegex.exec(lower)) !== null) {
    found.add(m[1]);
  }

  // Pass 2 — known bare section numbers
  for (const id of KNOWN_TABLE_IDS) {
    const escaped = id.replace(/\./g, "\\.");
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) {
      found.add(id);
    }
  }

  // Pass 3 — parent-section aliases (always expand all children — Set handles dedup)
  for (const [parent, children] of Object.entries(PARENT_ALIASES)) {
    const esc = parent.replace(/\./g, "\\.");
    if (new RegExp(`\\b${esc}\\b`).test(lower)) {
      for (const c of children) found.add(c);
    }
  }

  // Pass 4 — semantic aliases
  for (const [pattern, ids] of SEMANTIC_ALIASES) {
    if (pattern.test(lower)) {
      for (const id of ids) found.add(id);
    }
  }

  return [...found];
}
