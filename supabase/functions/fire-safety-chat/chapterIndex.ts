/**
 * Chapter/volume index for the SBC storage corpus (fire-safety-chat).
 *
 * Pure data + pure logic (no Deno-specific APIs) so it can be unit-tested and
 * imported safely by the Edge Function. Extracted from index.ts on 2026-08-23.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE — these chapter lists are MEASURED, not transcribed from a TOC.
 * ---------------------------------------------------------------------------
 * The previous version of this index was written from the printed table of
 * contents of each code and did not match the actual PDF file splits. Because
 * scoreFile() in index.ts gives a score of 0 to any storage file whose page
 * range does not overlap a target range, a wrong chapter list silently
 * EXCLUDED the volume that really held the answer. See
 * docs/audits/chapter-volume-map-20260823.md for the full evidence table.
 *
 * Measurement method (2026-08-23), reproducible:
 *   1. AUTHORITATIVE — running-header census of every page of the 18 split PDFs
 *      in D:\sbc_consultx. Each page carries a header of the form
 *      "CHAPTER <n>—<TITLE>". All 3,861 pages were parsed with PyMuPDF and the
 *      chapter label tallied per volume.
 *   2. CROSS-CHECK — pdfplumber 0.11.9 reproduced the same labels on 216
 *      sampled pages (12 per volume) with 216/216 agreement, and reproduced the
 *      full 200-page census of "SBC 801 ... 401-600" byte-for-byte.
 *   3. CORROBORATING — chapter_number tallies from the local staging chunk
 *      files (*_extracted_chunks.json). These agree with the PDF headers except
 *      where the chunker mis-attributed reference/appendix text; where the two
 *      disagree the PDF header wins.
 *
 * Self-validation: no gaps and no overlaps in the chapter sequence across
 * volumes. Where a chapter splits across a volume boundary, that boundary
 * chapter's number is the previous volume's last measured chapter AND the
 * next volume's first measured chapter (last == first). Measured directly
 * against the `chapters` arrays below, this holds at all 9 SBC 801 volume
 * boundaries and 6 of the 7 SBC 201 volume boundaries. The one exception is
 * SBC 201 volumes "1-250" -> "251-500": chapter 3 ends exactly at "1-250"'s
 * last measured page and chapter 4 begins fresh at "251-500"'s first
 * measured page — a clean chapter break, not a split chapter, so last(3) !=
 * first(4). This is still a gap-free, overlap-free transition (chapter 4
 * immediately follows chapter 3; chapter 3 is not duplicated); it simply
 * isn't a boundary-sharing case. See
 * docs/audits/chapter-volume-map-20260823.md and
 * src/__tests__/chapterVolumeMap.test.ts for the full boundary table and the
 * reproducible check.
 *
 * Chapter numbering that the old index got structurally wrong:
 *   - SBC 201 runs chapters 1-35 (34 is RESERVED) plus Appendices A-O.
 *   - SBC 801 runs chapters 1-12, 20-39, 50-67 and 80 (52 is RESERVED) plus
 *     Appendices A-N. Chapters 13-19, 40-49 and 68-79 DO NOT EXIST. The old
 *     index invented a dense 1..60 sequence and therefore pointed most fire
 *     topics at volumes that could not contain them.
 *
 * Where a chapter spans two volumes it is listed in BOTH, so retrieval keeps
 * the whole chapter rather than truncating it at a file boundary.
 *
 * NOTE ON `topics` / `topicsAr`: as of 2026-08-23 these two fields are written
 * but never read — retrieval uses only `chapters` (via selectTargetPageRanges)
 * and `pageRange` (via scoreFile). They are kept, and corrected against the
 * measured chapter titles, as documentation and for future keyword scoring;
 * they currently have no effect on which files are selected.
 */

export interface FilePageRange {
  pageRange: string; // e.g. "1-250"
  chapters: number[];
  topics: string[];
  topicsAr: string[];
}

/**
 * SBC 201 — The Saudi General Building Code. 8 volumes, 2,200 pages.
 * Measured chapter titles: 1 Scope and Applicability, 2 Definitions,
 * 3 Use and Occupancy Classification, 4 Special Detailed Requirements Based on
 * Occupancy, 5 General Building Heights and Areas, 6 Types of Construction,
 * 7 Fire and Smoke Protection Features, 8 Interior Finishes,
 * 9 Fire Protection Systems, 10 Means of Egress, 11 Accessibility,
 * 12 Interior Environment, 13 Energy Efficiency, 14 Exterior Walls,
 * 15 Roof Assembly, 16 Structural Design, 17 Special Inspections and Tests,
 * 18 Soils and Foundations, 19 Concrete, 20 Aluminum, 21 Masonry, 22 Steel,
 * 23 Woods, 24 Glass and Glazing, 25 Gypsum Board and Plaster, 26 Plastics,
 * 27 Electrical, 28 Mechanical Systems, 29 Plumbing Systems,
 * 30 Elevators and Conveying Systems, 31 Special Construction,
 * 32 Encroachments into the Public Right-of-Way,
 * 33 Safeguards During Construction, 34 RESERVED, 35 Referenced Standards.
 */
export const SBC201_INDEX: FilePageRange[] = [
  {
    // Measured: front matter/TOC pp.1-28, ch1 pp.29-60, ch2 pp.61-192, ch3 pp.195-250.
    pageRange: "1-250",
    chapters: [1, 2, 3],
    topics: ["scope", "applicability", "administration", "definitions", "use and occupancy classification", "occupancy", "classification", "assembly", "business", "educational", "factory", "institutional", "mercantile", "residential", "storage", "high hazard"],
    topicsAr: ["نطاق", "تطبيق", "إدارة", "تعريفات", "تصنيف الاستخدام والإشغال", "إشغال", "تصنيف", "تجمع", "أعمال", "تعليمي", "صناعي", "رعائي", "تجاري", "سكني", "تخزين", "خطورة عالية"],
  },
  {
    // Measured: ch4 pp.1-190, ch5 pp.191-250 (local pages within this volume).
    pageRange: "251-500",
    chapters: [4, 5],
    topics: ["special detailed requirements", "high-rise", "covered mall", "atrium", "parking garage", "hazardous materials", "special uses", "general building heights and areas", "height", "area", "allowable height", "building area", "mixed occupancy", "incidental use"],
    topicsAr: ["متطلبات تفصيلية خاصة", "مباني عالية", "مركز تجاري مغطى", "أتريوم", "مواقف سيارات", "مواد خطرة", "استخدامات خاصة", "ارتفاعات ومساحات المباني", "ارتفاع", "مساحة", "ارتفاع مسموح", "مساحة المبنى", "إشغال مختلط", "استخدام ثانوي"],
  },
  {
    // Measured: ch5 pp.1-14, ch6 pp.15-38, ch7 pp.39-322, ch8 pp.323-344, ch9 pp.345-500.
    // Chapter 9 (Fire Protection Systems) STARTS here and continues into 1001-1250.
    pageRange: "501-1000",
    chapters: [5, 6, 7, 8, 9],
    topics: ["types of construction", "fire and smoke protection features", "fire resistance rating", "fire wall", "fire barrier", "fire partition", "smoke barrier", "shaft enclosure", "opening protective", "penetration", "interior finishes", "flame spread", "fire protection systems", "sprinkler", "automatic sprinkler", "standpipe", "fire alarm", "extinguisher", "smoke control"],
    topicsAr: ["أنواع البناء", "مقاومة الحريق", "تصنيف مقاومة الحريق", "جدار حريق", "حاجز حريق", "فاصل حريق", "حاجز دخان", "مناور", "حماية الفتحات", "اختراقات", "تشطيبات داخلية", "انتشار اللهب", "أنظمة الحماية من الحريق", "رش", "رشاش", "رشاشات", "رش تلقائي", "أنابيب صاعدة", "إنذار حريق", "طفاية", "تحكم دخان"],
  },
  {
    // Measured: ch9 pp.1-23, ch10 pp.24-250.
    // Chapter 9 ENDS here; chapter 10 (Means of Egress) STARTS here.
    pageRange: "1001-1250",
    chapters: [9, 10],
    topics: ["fire protection systems", "sprinkler", "fire alarm", "means of egress", "exit", "exits", "exit access", "exit discharge", "stair", "stairs", "stairway", "corridor", "door", "travel distance", "occupant load", "common path", "handrail", "guard", "ramp", "emergency escape", "egress width"],
    topicsAr: ["أنظمة الحماية من الحريق", "رشاشات", "إنذار حريق", "وسائل الخروج", "مخرج", "مخارج", "منفذ الخروج", "تصريف الخروج", "درج", "سلم", "سلالم", "ممر", "باب", "مسافة سفر", "حمل إشغال", "مسار مشترك", "درابزين", "حماية سقوط", "منحدر", "هروب طوارئ", "إخلاء", "عرض المخرج"],
  },
  {
    // Measured: ch10 pp.1-64, ch11 pp.65-175, ch12 pp.176-203, ch13 pp.204-205, ch14 pp.206-250.
    pageRange: "1251-1500",
    chapters: [10, 11, 12, 13, 14],
    topics: ["means of egress", "exit", "accessibility", "accessible route", "interior environment", "ventilation", "lighting", "sound transmission", "energy efficiency", "exterior walls", "cladding", "veneer", "weather protection"],
    topicsAr: ["وسائل الخروج", "مخرج", "إتاحة الوصول", "مسار الوصول", "بيئة داخلية", "تهوية", "إنارة", "عزل صوتي", "كفاءة الطاقة", "جدران خارجية", "كسوة", "تكسية", "حماية من العوامل الجوية"],
  },
  {
    // Measured: ch14 pp.1-5, ch15 pp.6-52, ch16 pp.53-132, ch17 pp.133-169,
    // ch18 pp.170-171, ch19 pp.172-181, ch20 pp.182-184, ch21 pp.185-234,
    // ch22 pp.235-246, ch23 pp.247-250.
    pageRange: "1501-1750",
    chapters: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    topics: ["exterior walls", "roof assembly", "roofing", "structural design", "loads", "wind load", "seismic", "special inspections and tests", "soils and foundations", "concrete", "aluminum", "masonry", "steel", "wood"],
    topicsAr: ["جدران خارجية", "أسقف", "تغطية الأسقف", "التصميم الإنشائي", "أحمال", "حمل الرياح", "زلازل", "فحوصات واختبارات خاصة", "تربة وأساسات", "خرسانة", "ألمنيوم", "بناء", "حديد", "خشب"],
  },
  {
    // Measured: ch23 pp.1-69, ch24 pp.70-103, ch25 pp.104-134, ch26 pp.135-177,
    // ch27 pp.178-184, ch28 pp.185-188, ch29 pp.189-220, ch30 pp.221-250.
    pageRange: "1751-2000",
    chapters: [23, 24, 25, 26, 27, 28, 29, 30],
    topics: ["wood", "glass and glazing", "gypsum board", "plaster", "plastics", "electrical", "mechanical systems", "plumbing systems", "elevators", "conveying systems", "escalator"],
    topicsAr: ["خشب", "زجاج وتزجيج", "ألواح جبسية", "لياسة", "بلاستيك", "كهرباء", "أنظمة ميكانيكية", "أنظمة السباكة", "مصاعد", "أنظمة النقل", "سلم كهربائي"],
  },
  {
    // Measured: ch30 pp.1-6, ch31 pp.7-49, ch32 pp.50-58, ch33 pp.59-72,
    // ch34 pp.73-74 (RESERVED — excluded), ch35 pp.75-116, Appendices A-O pp.117-200.
    pageRange: "2001-2200",
    chapters: [30, 31, 32, 33, 35],
    topics: ["elevators", "special construction", "membrane structures", "temporary structures", "encroachments into the public right-of-way", "safeguards during construction", "demolition", "referenced standards", "appendix"],
    topicsAr: ["مصاعد", "إنشاءات خاصة", "هياكل غشائية", "منشآت مؤقتة", "التعديات على حق الطريق العام", "احتياطات أثناء البناء", "هدم", "المعايير المرجعية", "ملحق"],
  },
];

/**
 * SBC 801 — The Saudi Fire Protection Code. 10 volumes, 2,061 pages.
 * Measured chapter titles: 1 Scope and Administration, 2 Definitions,
 * 3 General Requirements, 4 Emergency Planning and Preparedness,
 * 5 Fire Service Features, 6 Building Services and Systems,
 * 7 Fire and Smoke Protection Features, 8 Interior Finish/Decorative Materials
 * and Furnishings, 9 Fire Protection and Life Safety Systems,
 * 10 Means of Egress, 11 Construction Requirements for Existing Buildings,
 * 12 Energy Systems, 20 Aviation Facilities, 21 Dry Cleaning,
 * 22 Combustible Dust-Producing Operations, 23 Motor Fuel-Dispensing Facilities
 * and Repair Garages, 24 Flammable Finishes, 25 Fruit and Crop Ripening,
 * 26 Fumigation and Insecticidal Fogging, 27 Semiconductor Fabrication
 * Facilities, 28 Lumber Yards and Agro-Industrial/Solid Biomass,
 * 29 Manufacture of Organic Coatings, 30 Industrial Ovens,
 * 31 Tents and Other Membrane Structures, 32 High-Piled Combustible Storage,
 * 33 Fire Safety During Construction and Demolition,
 * 34 Tire Rebuilding and Tire Storage, 35 Welding and Other Hot Work,
 * 36 Marinas, 37 Combustible Fibers, 38 Higher Education Laboratories,
 * 39 Processing and Extraction Facilities, 50 Hazardous Materials—General,
 * 51 Aerosols, 52 RESERVED, 53 Compressed Gases, 54 Corrosive Materials,
 * 55 Cryogenic Fluids, 56 Explosives and Fireworks,
 * 57 Flammable and Combustible Liquids, 58 Flammable Gases,
 * 59 Flammable Solids, 60 Highly Toxic and Toxic Materials,
 * 61 Liquefied Petroleum Gases, 62 Organic Peroxides, 63 Oxidizers,
 * 64 Pyrophoric Materials, 65 Pyroxylin Plastics,
 * 66 Unstable (Reactive) Materials, 67 Water-Reactive Solids and Liquids,
 * 80 Referenced Standards.
 */
export const SBC801_INDEX: FilePageRange[] = [
  {
    // Measured: front matter/TOC pp.1-31, ch1 pp.32-78, ch2 pp.79-200.
    pageRange: "1-200",
    chapters: [1, 2],
    topics: ["scope", "administration", "permits", "definitions", "terminology"],
    topicsAr: ["نطاق", "إدارة", "تصاريح", "تعريفات", "مصطلحات"],
  },
  {
    // Measured: ch2 pp.1-44, ch3 pp.46-92, ch4 pp.93-128, ch5 pp.130-162, ch6 pp.163-200.
    // NOTE: the old index claimed chapters 6-9 for this volume. Chapters 7, 8 and 9
    // are NOT here — chapter 9 is in 401-600 and 601-800.
    pageRange: "201-400",
    chapters: [2, 3, 4, 5, 6],
    topics: ["definitions", "general requirements", "housekeeping", "open burning", "emergency planning and preparedness", "fire drill", "evacuation plan", "fire service features", "fire department access", "fire apparatus access road", "fire command center", "key box", "building services and systems", "fuel-fired appliance", "commercial kitchen hood", "chimney", "refrigeration", "stationary storage battery"],
    topicsAr: ["تعريفات", "متطلبات عامة", "نظافة", "حرق مكشوف", "تخطيط طوارئ", "تمارين إخلاء", "خطة إخلاء", "خصائص خدمة الإطفاء", "وصول إطفاء", "طريق وصول آليات الإطفاء", "مركز قيادة الحريق", "صندوق مفاتيح", "خدمات وأنظمة المباني", "أجهزة تعمل بالوقود", "شفاط مطبخ تجاري", "مداخن", "تبريد", "بطاريات ثابتة"],
  },
  {
    // Measured: ch6 pp.1-8, ch7 pp.9-19, ch8 pp.20-61, ch9 pp.62-200.
    // Chapter 9 (Fire Protection and Life Safety Systems — Section 903 automatic
    // sprinkler systems, 905 standpipes, 906 extinguishers, 907 fire alarm,
    // 909 smoke control) STARTS here: 139 measured pages, the single largest
    // concentration of chapter 9 in the corpus.
    pageRange: "401-600",
    chapters: [6, 7, 8, 9],
    topics: ["building services and systems", "fire and smoke protection features", "fire barrier", "smoke barrier", "opening protective", "interior finish", "decorative materials", "furnishings", "flame spread", "fire protection and life safety systems", "fire protection systems", "sprinkler", "automatic sprinkler", "sprinkler system", "standpipe", "fire pump", "water supply", "fire extinguisher", "fire alarm", "detection", "notification", "smoke detector", "heat detector", "smoke control", "smoke management"],
    topicsAr: ["خدمات وأنظمة المباني", "خصائص الحماية من الحريق والدخان", "حاجز حريق", "حاجز دخان", "حماية الفتحات", "تشطيبات داخلية", "مواد تزيينية", "مفروشات", "انتشار اللهب", "أنظمة الحماية من الحريق وسلامة الأرواح", "أنظمة الحماية من الحريق", "رش", "رشاش", "رشاشات", "رش تلقائي", "نظام رشاشات", "أنابيب صاعدة", "مضخة حريق", "إمداد مياه", "طفاية حريق", "إنذار حريق", "كشف", "إنذار صوتي", "كواشف دخان", "كواشف حرارة", "تحكم دخان", "إدارة الدخان"],
  },
  {
    // Measured: ch9 pp.1-68, ch10 pp.69-200.
    // Chapter 9 ENDS here; chapter 10 (Means of Egress) STARTS here.
    pageRange: "601-800",
    chapters: [9, 10],
    topics: ["fire protection and life safety systems", "sprinkler", "standpipe", "fire alarm", "smoke control", "emergency responder radio coverage", "means of egress", "exit", "exits", "exit access", "stair", "stairway", "corridor", "door", "travel distance", "occupant load", "egress width", "emergency escape"],
    topicsAr: ["أنظمة الحماية من الحريق وسلامة الأرواح", "رشاشات", "أنابيب صاعدة", "إنذار حريق", "تحكم دخان", "تغطية لاسلكي المستجيبين", "وسائل الخروج", "مخرج", "مخارج", "منفذ الخروج", "درج", "سلم", "ممر", "باب", "مسافة سفر", "حمل إشغال", "عرض المخرج", "هروب طوارئ", "إخلاء"],
  },
  {
    // Measured: ch10 pp.1-179, ch11 pp.180-200.
    pageRange: "801-1000",
    chapters: [10, 11],
    topics: ["means of egress", "exit", "stair", "corridor", "travel distance", "occupant load", "assembly seating", "construction requirements for existing buildings", "existing buildings", "retrofit"],
    topicsAr: ["وسائل الخروج", "مخرج", "درج", "ممر", "مسافة سفر", "حمل إشغال", "مقاعد التجمع", "متطلبات البناء للمباني القائمة", "مباني قائمة", "تحديث"],
  },
  {
    // Measured: ch11 pp.1-25, ch12 pp.26-78, ch20 pp.83-105, ch21 pp.106-119,
    // ch22 pp.120-132, ch23 pp.133-192, ch24 pp.193-200.
    // NOTE: SBC 801 has no chapters 13-19; the old index invented them.
    pageRange: "1001-1200",
    chapters: [11, 12, 20, 21, 22, 23, 24],
    topics: ["existing buildings", "energy systems", "energy storage system", "stationary battery", "solar", "photovoltaic", "aviation facilities", "hangar", "dry cleaning", "combustible dust", "motor fuel-dispensing facilities", "repair garage", "fuel station", "flammable finishes", "spray finishing", "dipping", "powder coating"],
    topicsAr: ["مباني قائمة", "أنظمة الطاقة", "تخزين الطاقة", "بطاريات ثابتة", "طاقة شمسية", "خلايا شمسية", "مرافق الطيران", "حظائر طائرات", "تنظيف جاف", "غبار قابل للاحتراق", "محطات وقود", "ورش إصلاح", "تشطيبات قابلة للاشتعال", "طلاء رش", "غمس", "طلاء مسحوق"],
  },
  {
    // Measured: ch24 pp.1-37, ch25 pp.38-44, ch26 pp.45-54, ch27 pp.55-83,
    // ch28 pp.84-98, ch29 pp.99-111, ch30 pp.112-117, ch31 pp.118-144,
    // ch32 pp.145-194, ch33 pp.195-200.
    pageRange: "1201-1400",
    chapters: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
    topics: ["flammable finishes", "fruit and crop ripening", "fumigation", "insecticidal fogging", "semiconductor fabrication", "lumber yards", "solid biomass", "woodworking", "organic coatings", "industrial ovens", "tents", "membrane structures", "temporary structures", "high-piled combustible storage", "rack storage", "fire safety during construction and demolition"],
    topicsAr: ["تشطيبات قابلة للاشتعال", "تنضيج الفواكه والمحاصيل", "تبخير", "ضباب مبيدات", "تصنيع أشباه الموصلات", "مستودعات أخشاب", "كتلة حيوية صلبة", "نجارة", "طلاءات عضوية", "أفران صناعية", "خيام", "هياكل غشائية", "منشآت مؤقتة", "تخزين عالي قابل للاحتراق", "تخزين على رفوف", "سلامة الحريق أثناء البناء والهدم"],
  },
  {
    // Measured: ch33 pp.1-15, ch34 pp.16-22, ch35 pp.23-38, ch36 pp.39-44,
    // ch37 pp.45-50, ch38 pp.51-62, ch39 pp.63-69, ch50 pp.73-142,
    // ch51 pp.143-165, ch52 p.166 (RESERVED — excluded), ch53 pp.167-192,
    // ch54 pp.193-196, ch55 pp.197-200.
    // NOTE: SBC 801 has no chapters 40-49; the numbering jumps 39 -> 50.
    pageRange: "1401-1600",
    chapters: [33, 34, 35, 36, 37, 38, 39, 50, 51, 53, 54, 55],
    topics: ["fire safety during construction", "tire rebuilding", "tire storage", "welding", "hot work", "marinas", "combustible fibers", "higher education laboratories", "processing and extraction facilities", "hazardous materials", "control area", "maximum allowable quantity", "aerosols", "compressed gases", "corrosive materials", "cryogenic fluids"],
    topicsAr: ["سلامة الحريق أثناء البناء", "إعادة تأهيل الإطارات", "تخزين الإطارات", "لحام", "أعمال ساخنة", "مراسي", "ألياف قابلة للاحتراق", "مختبرات التعليم العالي", "منشآت المعالجة والاستخلاص", "مواد خطرة", "منطقة تحكم", "الكمية القصوى المسموحة", "رذاذ", "غازات مضغوطة", "مواد أكالة", "سوائل شديدة البرودة"],
  },
  {
    // Measured: ch55 pp.1-13, ch56 pp.14-56, ch57 pp.57-166, ch58 pp.167-184,
    // ch59 pp.185-195, ch60 pp.196-200.
    pageRange: "1601-1800",
    chapters: [55, 56, 57, 58, 59, 60],
    topics: ["cryogenic fluids", "explosives", "fireworks", "flammable and combustible liquids", "aboveground tank", "underground tank", "flammable gases", "flammable cryogenic fluids", "hydrogen", "flammable solids", "highly toxic materials", "toxic materials"],
    topicsAr: ["سوائل شديدة البرودة", "متفجرات", "ألعاب نارية", "سوائل قابلة للاشتعال والاحتراق", "خزان علوي", "خزان تحت الأرض", "غازات قابلة للاشتعال", "هيدروجين", "مواد صلبة قابلة للاشتعال", "مواد شديدة السمية", "مواد سامة"],
  },
  {
    // Measured: ch60 pp.1-20, ch61 pp.21-43, ch62 pp.44-54, ch63 pp.55-70,
    // ch64 pp.71-79, ch65 pp.80-85, ch66 pp.86-93, ch67 pp.94-100,
    // ch80 pp.105-124, Appendices A-N pp.126-230.
    // NOTE: SBC 801 has no chapters 68-79; the numbering jumps 67 -> 80.
    pageRange: "1801-2061",
    chapters: [60, 61, 62, 63, 64, 65, 66, 67, 80],
    topics: ["toxic materials", "liquefied petroleum gases", "LP-gas", "organic peroxides", "oxidizers", "oxidizing gases", "pyrophoric materials", "pyroxylin plastics", "cellulose nitrate", "unstable materials", "reactive materials", "water-reactive solids", "water-reactive liquids", "referenced standards", "appendix", "index"],
    topicsAr: ["مواد سامة", "غاز البترول المسال", "غاز مسال", "بيروكسيدات عضوية", "مؤكسدات", "غازات مؤكسدة", "مواد ذاتية الاشتعال", "بلاستيك نترات السليلوز", "مواد غير مستقرة", "مواد متفاعلة", "مواد صلبة متفاعلة مع الماء", "سوائل متفاعلة مع الماء", "المعايير المرجعية", "ملحق", "فهرس"],
  },
];

/**
 * Select the storage page ranges whose volumes actually contain any of the
 * target chapters.
 *
 * Pure: no I/O, no globals — the index is passed in. Returned order follows
 * first-match order over `targetChapters` then `index`.
 *
 * Fallback: when no chapter is targeted, or when no volume contains any of the
 * targeted chapters, the first two volumes of the index are returned. That
 * fallback is unchanged from the original implementation.
 */
export function selectTargetPageRanges(
  targetChapters: number[],
  index: FilePageRange[],
): string[] {
  if (targetChapters.length === 0) return index.slice(0, 2).map(i => i.pageRange);

  const matched = new Set<string>();
  for (const chapter of targetChapters) {
    for (const entry of index) {
      if (entry.chapters.includes(chapter)) {
        matched.add(entry.pageRange);
      }
    }
  }

  return matched.size > 0 ? [...matched] : index.slice(0, 2).map(i => i.pageRange);
}
