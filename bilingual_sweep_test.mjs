// bilingual_sweep_test.mjs
// Phase 1 — Authenticated Arabic/Bilingual Verification Sweep
// Extracts extractTableIds() from index.ts, strips TS types, runs 60+ bilingual queries.
// Run: node bilingual_sweep_test.mjs

import { readFileSync, writeFileSync, unlinkSync } from 'fs';

// ── Extract extractTableIds function from index.ts by line range ──
const allLines = readFileSync('supabase/functions/fire-safety-chat/index.ts', 'utf8').split('\n');

// Find exact line bounds using brace depth tracking
let funcStartLine = -1, funcEndLine = -1;
let depth = 0;
for (let i = 0; i < allLines.length; i++) {
  if (allLines[i].includes('function extractTableIds(query: string): string[] {') && funcStartLine === -1) {
    funcStartLine = i;
    depth = 1; // the opening brace on this line
    continue;
  }
  if (funcStartLine !== -1) {
    // Count braces (rough, ignores strings/regex, but good enough for this structured file)
    for (const ch of allLines[i]) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { funcEndLine = i; break; }
      }
    }
    if (funcEndLine !== -1) break;
  }
}

let funcSrc = allLines.slice(funcStartLine, funcEndLine + 1).join('\n');

// Strip TypeScript-specific syntax to make it valid JS
funcSrc = funcSrc
  .replace(/function extractTableIds\(query: string\): string\[\]/, 'function extractTableIds(query)')
  .replace(/const found = new Set<string>\(\);/, 'const found = new Set();')
  .replace(/let m: RegExpExecArray \| null;/, 'let m;')
  .replace(/: Record<string, string\[\]>/g, '')
  .replace(/: Array<\[RegExp, string\[\]\]>/g, '')
  .replace(/const LEGACY_MAP: Record<[^>]+>\s*=/g, 'const LEGACY_MAP =')
  .replace(/ as string/g, '');

writeFileSync('_tmp_routing.mjs', funcSrc + '\nexport { extractTableIds };');
const { extractTableIds } = await import('./_tmp_routing.mjs?' + Date.now());
unlinkSync('_tmp_routing.mjs');

// ── Test cases ──
// Format: [description, query, requiredIds_subset]
const TESTS = [
  // ════════════════════════════════════════════════════════
  // ENGLISH — Occupancy Classification
  // ════════════════════════════════════════════════════════
  ["EN: occupancy classification general",         "What is the occupancy group for this building?",              ["302"]],
  ["EN: occupancy group list",                     "List all occupancy groups",                                    ["302"]],
  ["EN: how to classify building",                 "How do I classify a building under SBC 201?",                 ["302"]],
  ["EN: assembly occupancy A-2",                   "Is a restaurant A-1 or A-2 occupancy?",                       ["303"]],
  ["EN: business Group B",                         "Is an office building Group B occupancy?",                    ["304"]],
  ["EN: educational Group E",                      "What is Group E occupancy for a school?",                     ["305"]],
  ["EN: residential hotel R-1",                    "Is a hotel R-1 occupancy?",                                   ["310"]],
  ["EN: residential apartment R-2",                "Is an apartment building R-2 or R-1?",                        ["310"]],
  ["EN: institutional I-2 hospital",               "What occupancy group is a hospital — I-2?",                   ["308"]],
  ["EN: I-3 detention",                            "What are Group I-3 occupancy requirements for a jail?",       ["408"]],
  ["EN: mercantile Group M",                       "Is a retail store Group M occupancy?",                        ["309"]],
  ["EN: storage Group S",                          "Is a warehouse Group S-1 or S-2?",                            ["311"]],
  // ════════════════════════════════════════════════════════
  // ENGLISH — Mixed Occupancy
  // ════════════════════════════════════════════════════════
  ["EN: mixed occupancy",                          "What are the mixed occupancy requirements?",                   ["508"]],
  ["EN: nonseparated occupancy",                   "What is nonseparated occupancy?",                              ["508.3"]],
  ["EN: separated occupancy fire barrier",         "What fire barrier is required for separated occupancy?",      ["508.4"]],
  ["EN: accessory occupancy 10%",                  "Can an accessory occupancy be 10 percent of the floor area?", ["508"]],
  // ════════════════════════════════════════════════════════
  // ENGLISH — Chapter 9 Fire Systems
  // ════════════════════════════════════════════════════════
  ["EN: sprinkler required",                       "When is an automatic sprinkler system required?",             ["903.2"]],
  ["EN: NFPA 13 vs 13R",                           "Should I use NFPA 13 or NFPA 13R for this building?",        ["903.3.1"]],
  ["EN: fire alarm required by occupancy",         "When is a fire alarm system required by occupancy?",          ["907.2"]],
  ["EN: fire alarm pull station",                  "Where are manual pull stations required?",                    ["907.4.2"]],
  ["EN: fire alarm monitoring",                    "Does the fire alarm system need to be monitored?",            ["907.6"]],
  ["EN: smoke control system",                     "When is a smoke control system required?",                    ["909"]],
  ["EN: standpipe required",                       "When is a standpipe system required?",                        ["905.3.1"]],
  ["EN: fire department connection FDC",           "Where must the FDC siamese connection be located?",           ["912"]],
  ["EN: fire pump required",                       "When is a fire pump required?",                               ["913"]],
  ["EN: ERCES radio coverage",                     "Is ERCES required in this building?",                         ["914"]],
  ["EN: carbon monoxide detector",                 "When is a carbon monoxide alarm required?",                   ["915"]],
  ["EN: commercial cooking suppression required",   "When is a commercial cooking hood suppression system required?", ["911"]],
  ["EN: type I hood fryer suppression",             "Does a commercial fryer require a Type I hood suppression system?", ["911"]],
  ["EN: wet chemical UL 300 kitchen",               "What type of wet chemical system is required for a commercial kitchen?", ["911"]],
  ["EN: sprinkler does not replace hood suppression","Does a sprinkler system replace the requirement for a cooking hood suppression system?", ["911"]],
  ["EN: kitchen suppression 6 month inspection",    "How often must a commercial kitchen suppression system be inspected?", ["911"]],
  ["EN: alternative fire suppression system",        "When is an alternative automatic fire-extinguishing system required?", ["904"]],
  ["EN: clean agent data center suppression",        "What clean agent system is required for a data center?",       ["904"]],
  ["EN: NFPA 2001 clean agent fire",                 "Which NFPA standard governs clean agent fire suppression?",   ["904"]],
  ["EN: CO2 suppression total flooding",             "Can a CO2 total flooding system protect a computer room?",    ["904"]],
  ["EN: foam suppression aircraft hangar",           "What suppression system is required for an aircraft hangar?", ["904"]],
  ["EN: water mist system NFPA 750",                 "When is a water mist fire suppression system used?",          ["904"]],
  ["EN: pre-discharge alarm clean agent",            "Is a pre-discharge alarm required before a clean agent system fires?", ["904"]],
  ["EN: alternative suppression substitute sprinkler","Can a clean agent system substitute for sprinklers?",        ["904"]],
  ["EN: smoke and heat vents required",             "When are smoke and heat vents required?",                      ["910"]],
  ["EN: smoke vent S-1 warehouse",                  "Do I need smoke vents in an S-1 warehouse over 50,000 sq ft?", ["910"]],
  ["EN: draft curtains depth",                      "What is the required depth of draft curtains with smoke vents?",["910"]],
  ["EN: smoke vent sprinkler exception",            "Are smoke vents required if the building is fully sprinklered?",["910"]],
  ["EN: gas detection required H-5",                "When is a gas detection system required?",                     ["916"]],
  ["EN: 25 percent LEL gas alarm",                  "What is the alarm threshold for combustible gas detection?",   ["916"]],
  ["EN: gas detector ceiling or floor",             "Where should gas detectors be located for natural gas vs propane?", ["916"]],
  ["EN: automatic gas shutoff valve",               "Is an automatic gas shutoff valve required with gas detection?",["916"]],
  // ════════════════════════════════════════════════════════
  // ENGLISH — Life Safety / Egress
  // ════════════════════════════════════════════════════════
  ["EN: travel distance max",                      "What is the maximum travel distance to an exit?",             ["1017.2"]],
  ["EN: number of exits",                          "What is the minimum number of exits required?",               ["1021.2"]],
  ["EN: corridor width minimum",                   "What is the minimum corridor width?",                         ["1018.1"]],
  ["EN: corridor fire rating",                     "What is the corridor fire resistance rating?",                ["1020.1"]],
  ["EN: exit door width",                          "What is the minimum door width for an exit?",                 ["1010"]],
  ["EN: panic hardware required",                  "Where is panic hardware required?",                           ["1010"]],
  ["EN: delayed egress lock",                      "Can I use a delayed egress lock on an exit door?",            ["1010"]],
  ["EN: handrail height",                          "What is the required handrail height on stairs?",             ["1012"]],
  ["EN: guardrail required",                       "Where are guardrails required?",                              ["1015"]],
  ["EN: guardrail height 42 inch",                 "What is the required guard height — 42 inches?",              ["1015"]],
  ["EN: exit sign required",                       "Where are exit signs required?",                              ["1013"]],
  ["EN: emergency lighting",                       "What are the emergency lighting requirements?",               ["1008"]],
  ["EN: stair width",                              "What is the minimum stair width?",                            ["1011.2"]],
  ["EN: luminous egress markings",                 "When are luminous egress path markings required?",            ["1024"]],
  ["EN: emergency escape window",                  "What size must an emergency escape window be in a bedroom?",  ["1030"]],
  ["EN: egress width per occupant",                "What is the egress width per occupant?",                      ["1005.1"]],
  ["EN: interior exit stairway fire rating",        "What is the fire resistance rating for an interior exit stairway?", ["1023"]],
  ["EN: interior exit stairway 4 stories 2 hour",  "Does a stairway serving 4 stories require a 2-hour enclosure?",  ["1023"]],
  ["EN: exit stairway openings prohibited",         "What openings are prohibited in an interior exit stairway enclosure?", ["1023"]],
  ["EN: exit stair discharge through lobby",        "Can an interior exit stairway discharge through a lobby?",       ["1023"]],
  ["EN: stairway to roof 4 stories",                "When must an exit stairway extend to the roof?",                 ["1023"]],
  ["EN: 1023 vs 1019 distinction",                  "What is the difference between an interior exit stairway and an exit access stairway?", ["1023", "1019"]],
  ["EN: exit access stairway enclosure",           "When must an exit access stairway be enclosed?",               ["1019"]],
  ["EN: open stair more than 2 stories",           "Is an open stairway connecting more than 2 stories allowed?",  ["1019"]],
  ["EN: exit access stair openings 1019.3",        "What openings are permitted in an exit access stairway enclosure per 1019.3?", ["1019"]],
  ["EN: exit passageway",                          "What are the requirements for an exit passageway?",            ["1022"]],
  ["EN: exit passageway fire rating",              "What is the fire rating required for exit passageway walls?",  ["1022"]],
  ["EN: exit passageway width 44 inch",            "What is the minimum exit passageway width?",                   ["1022"]],
  ["EN: exit passageway vs corridor",              "What is the difference between an exit passageway and a corridor?", ["1022"]],
  // ════════════════════════════════════════════════════════
  // ENGLISH — Spray Finishing and Dip Tanks (§416)
  // ════════════════════════════════════════════════════════
  ["EN: spray booth fire protection required",       "Does a paint spray booth require fire protection?",                  ["416"]],
  ["EN: spray booth size limit sprinklered",         "What is the maximum size of a spray booth in a sprinklered building?", ["416"]],
  ["EN: spray booth construction noncombustible",    "What construction material is required for a spray booth?",          ["416"]],
  ["EN: spray booth ventilation LEL",                "What ventilation is required to keep vapors below LEL in a spray booth?", ["416"]],
  ["EN: dip tank fire protection NFPA 34",           "What fire protection is required for a dip tank operation?",         ["416"]],
  ["EN: spray finishing Group H trigger",            "When does a spray finishing operation become Group H occupancy?",    ["416"]],
  ["EN: powder coating booth fire",                  "What are the fire requirements for a powder coating booth?",         ["416"]],
  ["EN: NFPA 33 spray application",                  "Which NFPA standard governs spray finishing using flammable materials?", ["416"]],
  // ════════════════════════════════════════════════════════
  // ENGLISH — Sleeping Units §420
  // ════════════════════════════════════════════════════════
  ["EN: sleeping unit separation R-2",               "What fire resistance rating separates dwelling units in R-2 apartments?", ["420"]],
  ["EN: smoke alarm sleeping room required",         "Are smoke alarms required in every sleeping room?",                  ["420"]],
  ["EN: hotel room fire partition R-1",              "What fire partition is required between hotel rooms?",               ["420"]],
  ["EN: CO alarm R-1 R-2 required",                  "When are carbon monoxide alarms required in hotels and apartments?", ["420"]],
  ["EN: interconnected smoke alarms R-2",            "Must smoke alarms be interconnected in R-2 apartment buildings?",   ["420"]],
  // ════════════════════════════════════════════════════════
  // ENGLISH — Combustible / High-Piled Storage (§413)
  // ════════════════════════════════════════════════════════
  ["EN: high-piled storage trigger 12 ft",         "When does storage become high-piled? What is the 12-foot threshold?",   ["413"]],
  ["EN: high-piled storage sprinkler required",     "Are sprinklers required throughout a building with high-piled storage?", ["413"]],
  ["EN: rack storage fire protection",              "What fire protection is required for rack storage in a warehouse?",     ["413"]],
  ["EN: in-rack sprinklers required",               "When are in-rack sprinklers required?",                                ["413"]],
  ["EN: storage aisle width 44 inch",               "What is the minimum aisle width between high-piled storage piles?",    ["413"]],
  ["EN: commodity class Group A plastics",          "What is the sprinkler requirement for Group A plastics storage?",      ["413"]],
  ["EN: high-piled vs S-1 sprinkler threshold",     "Does high-piled storage change the S-1 sprinkler requirement?",       ["413"]],
  ["EN: storage height fire protection path",       "Does storage height over 12 feet change the fire protection path?",   ["413"]],
  // ========================================================================
  // ENGLISH - Aircraft-Related Occupancies (Section 412)
  // ========================================================================
  ["EN: aircraft hangar suppression grouping",      "How do I classify an aircraft hangar fire suppression group under Table 412.3.6?", ["412"]],
  ["EN: hangar floor drains oil separator",         "Are floor drains and oil separators required in aircraft hangars?",               ["412"]],
  ["EN: hangar hazardous operations trigger",       "Which hazardous operations in a Group III hangar trigger higher suppression?",    ["412"]],
  ["EN: hangar heating equipment separation",       "What separation is required for heating equipment in a commercial hangar?",       ["412"]],
  // ========================================================================
  // ENGLISH - Drying Rooms (Section 417)
  // ========================================================================
  ["EN: drying room noncombustible construction",   "Must a drying room be constructed from noncombustible materials?",               ["417"]],
  ["EN: drying room heating pipe clearance",        "What is the required overhead heating pipe clearance in a drying room?",          ["417"]],
  ["EN: drying room insulation 80 c",               "When dryer temperature is 80 C or more, what insulation is required?",            ["417"]],
  ["EN: drying room high-hazard fire protection",   "When does a drying room need an approved automatic fire-extinguishing system?",   ["417"]],
  // ════════════════════════════════════════════════════════
  // ENGLISH — Special Occupancies
  // ════════════════════════════════════════════════════════
  ["EN: high-rise requirements",                   "What are the special requirements for high-rise buildings?",  ["403.1"]],
  ["EN: atrium smoke control",                     "What are the fire requirements for an atrium?",               ["404"]],
  ["EN: underground building",                     "What special rules apply to underground buildings?",          ["405"]],
  ["EN: covered mall",                             "What are the fire code requirements for a covered mall?",     ["402"]],
  ["EN: I-2 healthcare corridor",                  "What are the corridor requirements for a Group I-2 hospital?",["407"]],
  ["EN: hazmat control areas",                     "How many control areas are allowed per floor for hazardous materials?", ["414"]],
  ["EN: H-1 detached building",                    "When is a detached building required for H-1 occupancy?",    ["415"]],
  ["EN: MAQ exceeded",                             "What happens when hazardous material quantities exceed the MAQ?", ["414"]],
  // ════════════════════════════════════════════════════════
  // ARABIC — Occupancy Classification
  // ════════════════════════════════════════════════════════
  ["AR: تصنيف الإشغال عام",                        "ما تصنيف إشغال هذا المبنى؟",                                 ["302"]],
  ["AR: مجموعات الإشغال المختلفة",                 "ما هي مجموعات الإشغال المختلفة؟",                            ["302"]],
  ["AR: كيف أصنف",                                 "كيف أصنف مبنى مختلط الاستخدامات؟",                          ["302"]],
  ["AR: إشغال سكني فندقي R-1",                     "هل الفندق يصنف R-1 أم R-2؟",                                 ["310"]],
  ["AR: إشغال الشقق السكنية",                      "ما تصنيف مبنى الشقق السكنية؟",                               ["310"]],
  ["AR: إشغال مكاتب B",                            "ما تصنيف مبنى مكاتب؟",                                       ["304"]],
  ["AR: تصنيف المستشفى",                           "ما تصنيف المستشفى كإشغال؟",                                  ["308"]],
  ["AR: تصنيف السجن",                              "ما تصنيف السجن كإشغال؟",                                     ["408"]],
  // ════════════════════════════════════════════════════════
  // ARABIC — Mixed Occupancy
  // ════════════════════════════════════════════════════════
  ["AR: الإشغال المختلط",                          "متطلبات الإشغال المختلط في مبنى واحد؟",                      ["508"]],
  ["AR: مبنى متعدد الاستخدامات",                   "كيف أطبق اشتراطات مبنى متعدد الاستخدامات؟",                 ["508"]],
  ["AR: فصل الإشغالات",                            "متى يجب فصل الإشغالات بحاجز حريق؟",                         ["508"]],
  ["AR: غير مفصول في مبنى واحد",                   "هل إشغال مكتبي وتجاري في مبنى واحد غير مفصول مسموح؟",      ["508"]],
  // ════════════════════════════════════════════════════════
  // ARABIC — Chapter 9 Fire Systems
  // ════════════════════════════════════════════════════════
  ["AR: متى يلزم نظام الرشاشات",                   "متى يلزم نظام الرشاشات في مبنى سكني؟",                      ["903.2"]],
  ["AR: نظام إنذار الحريق إلزامي",                 "متى يكون نظام إنذار الحريق إلزامياً؟",                      ["907.2"]],
  ["AR: اشتراطات الإنذار حسب الإشغال",             "ما اشتراطات إنذار الحريق حسب الإشغال؟",                     ["907.2"]],
  ["AR: نظام التحكم في الدخان",                    "ما متطلبات نظام التحكم في الدخان؟",                          ["909"]],
  ["AR: التشعبات السيامية",                        "كيف تُصمم التشعبات السيامية في المبنى؟",                    ["912"]],
  ["AR: تغطية الراديو ERCES",                      "هل يلزم نظام تعزيز الاتصالات الراديو في المبنى؟",           ["914"]],
  ["AR: تغطية راديو المستجيبين",                   "ما متطلبات تغطية الراديو للمستجيبين داخل المبنى؟",           ["914"]],
  // ════════════════════════════════════════════════════════
  // ARABIC — Life Safety / Egress
  // ════════════════════════════════════════════════════════
  ["AR: عرض باب مخرج الطوارئ",                     "ما الحد الأدنى لعرض باب مخرج الطوارئ؟",                     ["1010"]],
  ["AR: درابزين الحماية الواقي",                   "ما ارتفاع درابزين الحماية الواقي المطلوب؟",                  ["1015"]],
  ["AR: متى يلزم درابزين واقٍ",                    "متى يلزم درابزين واقٍ؟",                                     ["1015"]],
  ["AR: درابزين يد الدرج",                         "ما ارتفاع درابزين اليد على السلم؟",                           ["1012"]],
  ["AR: علامات الإخلاء المضيئة",                   "ما هي علامات مسار الإخلاء المضيئة؟",                         ["1024"]],
  ["AR: فسفور مسار الهروب",                        "هل يلزم فسفور مسار الهروب في المباني الشاهقة؟",              ["1024"]],
  ["AR: نظام إطفاء بديل متى يلزم",                  "متى يلزم نظام إطفاء تلقائي بديل؟",                          ["904"]],
  ["AR: عامل إطفاء نظيف مركز البيانات",             "ما نظام الإطفاء المناسب لغرفة الخوادم؟",                     ["904"]],
  ["AR: إطفاء ثاني أكسيد الكربون",                  "هل نظام ثاني أكسيد الكربون مناسب لإطفاء غرفة الحاسب؟",      ["904"]],
  ["AR: رغوة إطفاء حظيرة طائرات",                   "ما نظام الإطفاء المطلوب في حظيرة الطائرات؟",                 ["904"]],
  ["AR: نظام إخماد المطبخ متى يلزم",               "متى يلزم نظام إخماد شفاط المطبخ التجاري؟",                   ["911"]],
  ["AR: إخماد قلاية الزيت",                        "هل تحتاج قلاية الزيت التجارية إلى نظام إخماد؟",               ["911"]],
  ["AR: صيانة نظام إخماد المطبخ",                  "كم مرة يجب فحص نظام إخماد المطبخ؟",                          ["911"]],
  ["AR: فتحات الدخان والحرارة",                    "متى تُلزم فتحات الدخان والحرارة في المستودعات؟",             ["910"]],
  ["AR: نظام كشف الغاز متى يلزم",                  "متى يلزم نظام كشف الغاز في المبنى؟",                         ["916"]],
  ["AR: كاشف غاز محترق 25 بالمئة",                 "ما هو حد إنذار كاشف الغاز القابل للاشتعال؟",                 ["916"]],
  ["AR: إغلاق الغاز التلقائي",                     "هل يلزم صمام إغلاق الغاز التلقائي مع نظام الكشف؟",           ["916"]],
  ["AR: درج المخرج الداخلي تقييم الحريق",           "ما تقييم الحريق المطلوب لدرج المخرج الداخلي؟",               ["1023"]],
  ["AR: درج المخرج المغلق فتحات محظورة",           "ما الفتحات المحظورة في تغليف درج المخرج الداخلي؟",            ["1023"]],
  ["AR: درج المخرج حتى السطح",                     "متى يجب أن يمتد درج المخرج حتى السطح؟",                      ["1023"]],
  ["AR: درج وصول المخرج تغليف",                   "متى يجب تغليف درج وصول المخرج؟",                             ["1019"]],
  ["AR: درج مفتوح بين الطوابق",                   "هل يُسمح بدرج مفتوح بين أكثر من طابقين؟",                   ["1019"]],
  ["AR: ممر المخرج المحمي",                        "ما متطلبات ممر المخرج المحمي؟",                               ["1022"]],
  ["AR: عرض ممر المخرج",                           "ما الحد الأدنى لعرض ممر المخرج؟",                            ["1022"]],
  // ════════════════════════════════════════════════════════
  // ARABIC — Spray Finishing and Dip Tanks (§416)
  // ════════════════════════════════════════════════════════
  ["AR: كشك الرش حماية حريق",                       "هل يلزم نظام حماية حريق داخل كشك الرش؟",                          ["416"]],
  ["AR: مساحة كشك الرش مع رشاشات",                  "ما الحد الأقصى لمساحة كشك الرش في مبنى مزود بالرشاشات؟",          ["416"]],
  ["AR: حوض الغمس اشتراطات الحريق",                  "ما متطلبات الحماية من الحريق لعمليات حوض الغمس؟",                  ["416"]],
  ["AR: متى يصبح كشك الرش إشغال H",                  "متى تصبح عملية الرش إشغال H خطراً؟",                              ["416"]],
  // ════════════════════════════════════════════════════════
  // ARABIC — Sleeping Units §420
  // ════════════════════════════════════════════════════════
  ["AR: فصل وحدات الشقق السكنية",                    "ما تقييم الحريق المطلوب للفصل بين وحدات الشقق السكنية R-2؟",       ["420"]],
  ["AR: كاشف دخان غرفة النوم",                       "هل يلزم كاشف دخان في كل غرفة نوم؟",                               ["420"]],
  ["AR: فصل غرف الفندق حاجز حريق",                   "ما متطلبات الفصل بين غرف الفندق R-1؟",                            ["420"]],
  ["AR: كاشف CO الفندق والشقق",                      "متى يلزم كاشف أول أكسيد الكربون في الفنادق والشقق؟",              ["420"]],
  // ════════════════════════════════════════════════════════
  // ARABIC — Combustible / High-Piled Storage (§413)
  // ════════════════════════════════════════════════════════
  ["AR: تخزين مرتفع متى يلزم",                    "متى يُعتبر التخزين تخزيناً مرتفعاً؟",                         ["413"]],
  ["AR: مستودع تخزين مرتفع رشاشات",               "هل يلزم نظام رشاشات كامل في مستودع التخزين المرتفع؟",         ["413"]],
  ["AR: رشاشات داخل الرفوف متى تلزم",             "متى تلزم رشاشات داخل رفوف التخزين؟",                          ["413"]],
  ["AR: ارتفاع التخزين 12 قدم",                   "ما هو الارتفاع الذي يُحوّل التخزين إلى تخزين مرتفع؟",         ["413"]],
  // ========================================================================
  // ARABIC - Aircraft-Related Occupancies (Section 412)
  // ========================================================================
  ["AR: حظيرة الطائرات تصنيف 412.3.6",            "كيف يتم تصنيف حظيرة الطائرات حسب جدول 412.3.6؟",              ["412"]],
  ["AR: تصريف أرضية الحظيرة",                     "هل يلزم تصريف أرضية حظيرة الطائرات عبر فاصل زيوت؟",            ["412"]],
  ["AR: عمليات خطرة في حظيرة group iii",          "ما العمليات الخطرة في حظيرة Group III التي ترفع متطلبات الإطفاء؟", ["412"]],
  // ========================================================================
  // ARABIC - Drying Rooms (Section 417)
  // ========================================================================
  ["AR: غرفة التجفيف مواد غير قابلة للاحتراق",    "هل يجب أن تكون غرفة التجفيف من مواد غير قابلة للاحتراق؟",      ["417"]],
  ["AR: خلوص أنابيب التسخين 50 مم",               "ما خلوص أنابيب التسخين المطلوب داخل غرفة التجفيف؟",            ["417"]],
  ["AR: عزل غرفة التجفيف 80 مئوية",               "عند درجة تشغيل 80 مئوية، ما العزل المطلوب لغرفة التجفيف؟",     ["417"]],
  ["AR: غرفة التجفيف حماية حريق",                 "متى يلزم نظام إطفاء تلقائي لغرفة التجفيف عالية الخطورة؟",      ["417"]],
  // ════════════════════════════════════════════════════════
  // ARABIC — Special Occupancies
  // ════════════════════════════════════════════════════════
  ["AR: المبنى الشاهق",                            "ما متطلبات المبنى الشاهق؟",                                  ["403.1"]],
  ["AR: من أين يعتبر المبنى شاهقاً",               "من أين يُعتبر المبنى شاهقاً؟",                              ["403.1"]],
  ["AR: كميات المواد الخطرة MAQ",                   "ما الحد الأقصى للكميات المسموح من المواد الخطرة؟",           ["414"]],
  ["AR: مناطق التحكم للمواد الخطرة",               "كم عدد مناطق التحكم المسموح بها للمواد الخطرة؟",             ["414"]],
  ["AR: إشغال H-1",                                "متى يجب أن يكون المبنى إشغال H-1؟",                         ["415"]],
  ["AR: إشغال H-2 مواد قابلة للاشتعال",            "ما متطلبات إشغال H-2 للمواد القابلة للاشتعال؟",             ["415"]],
  // ════════════════════════════════════════════════════════
  // SECTION NUMBER ROUTING — direct reference
  // ════════════════════════════════════════════════════════
  ["SEC: section 903 direct",                      "What does section 903 say about sprinklers?",                 ["903.2"]],
  ["SEC: section 907 direct",                      "Refer to section 907 for fire alarm requirements",            ["907.2"]],
  ["SEC: section 508 direct",                      "Per section 508, how do I handle mixed occupancy?",           ["508"]],
  ["SEC: جدول 1017.2 Arabic",                      "ما هو الجدول 1017.2 للمسافات؟",                              ["1017.2"]],
  ["SEC: bare 914 number",                         "ERCES section 914 requirements",                              ["914"]],
];

// ── Run tests ──
let pass = 0;
let fail = 0;
const failures = [];
const categories = {};

for (const [desc, query, required] of TESTS) {
  const prefix = desc.split(':')[0];
  if (!categories[prefix]) categories[prefix] = { pass: 0, fail: 0 };

  const result = extractTableIds(query);
  const resultSet = new Set(result);
  const missing = required.filter(id => !resultSet.has(id));

  if (missing.length === 0) {
    pass++;
    categories[prefix].pass++;
    console.log(`  PASS [${prefix}]: ${desc.slice(prefix.length + 2)}`);
  } else {
    fail++;
    categories[prefix].fail++;
    failures.push({ desc, query, required, got: result, missing });
    console.log(`  FAIL [${prefix}]: ${desc.slice(prefix.length + 2)}`);
    console.log(`        Query:    ${query}`);
    console.log(`        Expected: ${required.join(', ')}  Got: ${result.join(', ') || '(none)'}`);
    console.log(`        Missing:  ${missing.join(', ')}`);
  }
}

console.log('\n=== Category Summary ===');
for (const [cat, stats] of Object.entries(categories)) {
  const total = stats.pass + stats.fail;
  const status = stats.fail === 0 ? 'CLEAN' : `${stats.fail} FAIL`;
  console.log(`  ${cat.padEnd(8)} ${stats.pass}/${total} — ${status}`);
}

console.log(`\n=== TOTAL: ${pass} passed, ${fail} failed out of ${TESTS.length} tests ===\n`);

if (failures.length > 0) {
  console.log('=== Failed tests summary ===');
  failures.forEach(f => console.log(`  - ${f.desc}: missing [${f.missing.join(', ')}]`));
  process.exit(1);
} else {
  console.log('All bilingual routing tests passed.');
}
