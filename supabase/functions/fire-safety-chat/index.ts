import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildModelChain,
  classifyGeminiChainFailure,
  classifyGeminiError,
  clearQuotaIncrement,
  fetchAvailableGeminiModels,
  fetchGeminiNonStreamingWithRetry,
  fetchGeminiStreamWithRetry,
  resolveThinkingEffort,
  recordQuotaIncrement,
  rollbackQuotaIfNeeded,
} from "./geminiResilience.ts";
import {
  contextCacheStats,
  DEFAULT_CONTEXT_CACHE_TTL_SECONDS,
  ensureContextCache,
  lookupContextCache,
  isContextCacheEnabled,
  type ContextCacheRef,
} from "./geminiContextCache.ts";
import {
  getNewCodeChapters,
  SBC201_INDEX,
  SBC401_INDEX,
  SBC501_INDEX,
  SBC801_INDEX,
  selectTargetPageRanges,
} from "./chapterIndex.ts";
import {
  buildStructuredTableBlock,
  CITATION_TOKEN_CONTRACT,
  CORE_RULES,
  getAnalysisPrompt,
  getAudienceBlock,
  getPrimaryPrompt,
  getStandardPrompt,
  getValidationPrompt,
  type StructuredTableRow,
} from "./promptContract.ts";
import { getSecretKey, getSecretKeyOrNull, getPublishableKey } from "../_shared/supabaseKeys.ts";
import {
  applySimilarityFloor,
  RETRIEVAL_ENGINE_HEADER,
  RETRIEVAL_FALLBACK_HEADER,
  resolveFloor,
  resolveFloorMode,
  shouldUseVectorForAdvisory,
  VECTOR_MIN_SIMILARITY_ABS,
  VECTOR_MIN_SIMILARITY_ABS_ENV,
  VECTOR_MIN_SIMILARITY_REL,
  VECTOR_MIN_SIMILARITY_REL_ENV,
  type RetrievalEngine,
} from "./retrievalPolicy.ts";
import { clampAssembledContext, TOTAL_CONTEXT_CAP } from "./contextBudget.ts";
import { buildTableSourceSignals, formatExternalRefsBlock, type ExternalRefRow } from "./sourceSignals.ts";
import {
  ADVISORY_GRAPH_FLAG_ENV,
  buildExpansionQuerySpec,
  composeContext,
  GRAPH_EXPANSION_HEADER,
  isGraphExpansionEnabled,
  SEED_K_EXPANDED,
  selectExpansionTargets,
  type ContentById,
  type IndegreeMap,
  type SeedMatch,
  type XrefEdge,
} from "./graphExpansion.ts";
import {
  buildMachineFactsBlock,
  buildQueryAnalysisPrompt,
  isQueryAnalysisEnabled,
  parseQueryFacts,
  resolveAudience,
  type QueryFacts,
} from "./queryAnalysis.ts";
import {
  deriveTargetSections,
  isDerivationEnabled,
  type DerivedSection,
} from "./derivationMap.ts";
import {
  buildPageManifestBlock,
  isVisionPageManifestEnabled,
  LEGEND_JSON_CONTRACT_EXTENSION,
  mergeLegendKeywords,
  parseLegendSymbols,
  sanitizeManifestEntries,
  type PageManifestEntry,
} from "./visionManifest.ts";
import {
  loadKnownSections,
  parseRetrievedChunks,
  verifyCitations,
} from "./citationVerifier.ts";
import { createStreamScrubber } from "./externalClauseScrubber.ts";
import { buildingProfileEnabled, fetchBuildingProfileBlock, isConversationId } from "./buildingProfileBlock.ts";
import { fetchSBCContextKeywordFts, isKeywordFtsEnabled } from "./keywordRetrieval.ts";
import {
  fetchSBCContextHybrid,
  HYBRID_FTS_WEIGHT_DEFAULT,
  HYBRID_FTS_WEIGHT_ENV,
  HYBRID_RETRIEVAL_FLAG_ENV,
  HYBRID_VECTOR_QUOTA_RATIO_DEFAULT,
  HYBRID_VECTOR_QUOTA_RATIO_ENV,
  isHybridRetrievalEnabled,
} from "./hybridRetrieval.ts";
import {
  cacheKey,
  getCorpusVersion,
  getEmbeddingCached,
  getRetrievalCached,
  normalizeForKey,
  retrievalCacheEnabled,
  RUNTIME_SETTINGS_TABLE,
  type RetrievalCacheClient,
} from "./retrievalCache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // x-consultx-admin-entitlement-override: the admin plan-simulation toggle
  // (src/lib/adminEntitlementOverride.ts). The frontend attaches this header on
  // EVERY chat request whenever an admin has an override selected (e.g. "Owner
  // Mode" to reach advisory/analysis). This function never reads it — admin
  // entitlement is derived server-side from ADMIN_EMAILS — but it MUST be in the
  // preflight allow-list or the browser blocks the request before it is sent,
  // surfacing as the UI "Connection error" in advisory/analysis while primary
  // (tested with no override) works. Root cause of the 2026-08-31 advisory
  // outage; proven with a live OPTIONS preflight. Keep lowercase (CORS matches
  // header names case-insensitively).
  // x-region: consumed by the Supabase platform BEFORE the function runs — it
  // pins execution to the named region. The DB lives in ap-southeast-2 while
  // unpinned invocations execute near the caller, making every DB round trip
  // cross half the planet (~400ms each; measured 2026-09-02). The browser still
  // needs the header allowed here or the preflight rejects it (same failure
  // class as the 2026-08-31 advisory outage above).
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-consultx-admin-entitlement-override, x-region",
  // X-Retrieval-Engine restored 2026-08-23 (deleted by 587fd5b): it reports
  // which retrieval engine actually served the request ("vector" | "keyword"),
  // so the bench and the post-deploy smoke can tell the two paths apart from
  // outside the function. Must stay in Expose-Headers or the browser hides it.
  //
  // X-Graph-Expansion (G1, wave 2) is deliberately NOT listed here. This
  // constant is spread into EVERY response this function builds — the OPTIONS
  // preflight and all thirteen error responses included — so adding a name to
  // it unconditionally changes response bytes on paths that have nothing to do
  // with graph expansion, even with the flag off. The G1 contract is that a
  // flag-off response is byte-identical to HEAD, so the exposure is added
  // instead on the one response that actually carries the header (see the
  // streaming Response near the end of the handler). Expose-Headers is only
  // ever read from the actual response anyway, never from the preflight.
  "Access-Control-Expose-Headers": `X-SBC-Sources, X-SBC-Source-Meta, ${RETRIEVAL_ENGINE_HEADER}`,
};

// ==================== CORE RULES (Non-negotiable) ====================
// MOVED 2026-08-23 to ./promptContract.ts together with the three mode prompts,
// so the prompt contract is pure and unit-testable (same pattern as
// ./chapterIndex.ts and ./geminiResilience.ts). The move also restored the
// certainty-labeling rules that commit 587fd5b deleted, and removed the NFPA /
// SFPE source claims the retrieval path cannot honour. See the module header
// and src/__tests__/promptContract.test.ts.

// ==================== LANGUAGE-SPECIFIC CONTENT ====================
const SECTION_TITLES = {
  ar: {
    executiveSummary: "## ✅ الخلاصة التنفيذية",
    technicalDetails: "## 🔎 التفاصيل الفنية (اضغط للتوسع)",
    referenceText: "A) النص المرجعي (English Quote)",
    arabicTranslation: "B) الترجمة العربية للنص",
    technicalAnalysis: "C) التحليل الفني بالعربية",
    engineeringLogic: "D) الاشتقاق الهندسي",
    recommendations: "E) توصيات عملية",
    ahjNotes: "F) ملاحظات واعتمادات AHJ",
    verdict: "الحكم النهائي",
    requirement: "المتطلب النظامي المختصر",
    projectStatus: "حالة المشروع",
    requiredActions: "الإجراءات المطلوبة",
  },
  en: {
    executiveSummary: "## ✅ Executive Summary",
    technicalDetails: "## 🔎 Technical Details (Click to expand)",
    referenceText: "A) Reference Text (English Quote)",
    arabicTranslation: "B) Arabic Translation",
    technicalAnalysis: "C) Technical Analysis",
    engineeringLogic: "D) Engineering Derivation",
    recommendations: "E) Practical Recommendations",
    ahjNotes: "F) AHJ Notes & Approvals",
    verdict: "Final Verdict",
    requirement: "Regulatory Requirement",
    projectStatus: "Project Status",
    requiredActions: "Required Actions",
  }
};

// ==================== SMART FILE INDEX ====================
// Maps chapters to storage page ranges for targeted file selection.
//
// MOVED 2026-08-23 to ./chapterIndex.ts so the index data and the selection
// logic are pure and unit-testable (same pattern as ./geminiResilience.ts).
// The chapter lists there are MEASURED from the running headers of every page
// of the split PDFs, not transcribed from the printed table of contents, which
// is what the previous lists did wrong. Evidence table:
// docs/audits/chapter-volume-map-20260823.md

// ==================== CHAPTER KEYWORDS MAPPING ====================
// Maps keywords to chapter numbers. getTargetChapters() feeds the result to
// selectTargetPageRanges() in ./chapterIndex.ts, which turns chapters into
// storage page ranges; scoreFile() then gives 0 to every storage file whose
// page range does not overlap one of them. A wrong chapter number therefore
// does not down-rank the right volume — it EXCLUDES it.
//
// REPAIRED 2026-08-23 (B4). The `sbc801` column was written against the OLD,
// invented dense 1..60 chapter sequence that ./chapterIndex.ts replaced with a
// measured one. SBC 801 really numbers its chapters 1-12, 20-39, 50-67 and 80
// (52 RESERVED); chapters 13-19, 40-49 and 68-79 DO NOT EXIST. Measured against
// the corrected SBC801_INDEX, the old column:
//   - referenced 7 chapter numbers that exist nowhere in the corpus
//     (13, 19, 40, 43, 46, 47, 49) — those keywords reached NOTHING;
//   - left 3 of the 10 SBC 801 volumes unreachable by any keyword
//     ("1-200", "1601-1800", "1801-2061");
//   - never included chapter 9 (Fire Protection and Life Safety Systems —
//     Section 903 automatic sprinklers, 905 standpipes, 906 extinguishers,
//     907 fire alarm, 909 smoke control) for ANY sprinkler/suppression term.
//     A sprinkler query reached volume "401-600" only by the accident that
//     chapters 6 and 7 happen to sit in the same measured volume as 9, and
//     never reached "601-800" (chapter 9 pp.1-68) at all.
// The `sbc201` column was already clean: all 8 SBC 201 volumes reachable. Its
// only defect was chapter 34, which is RESERVED in SBC 201 and present in no
// volume (see the "Existing buildings" group below).
//
// Every replacement chapter number below is derived from the MEASURED chapter
// titles in ./chapterIndex.ts (its two index header comments) — not from a
// printed table of contents and not from the topic guesses this map used to
// contain. Where no measured chapter title covers a keyword, the mapping is
// left EMPTY and called out in a comment rather than invented.
// Evidence and the before/after reachability table:
// docs/audits/advisory-vector-bench-20260823.md
const CHAPTER_KEYWORDS: Record<string, { sbc201: number[]; sbc801: number[] }> = {
  // Occupancy & Classification
  "occupancy": { sbc201: [3, 4], sbc801: [] },
  "إشغال": { sbc201: [3, 4], sbc801: [] },
  "classification": { sbc201: [3], sbc801: [] },
  "تصنيف": { sbc201: [3], sbc801: [] },
  "mixed": { sbc201: [3, 4], sbc801: [] },
  "مختلط": { sbc201: [3, 4], sbc801: [] },
  "residential": { sbc201: [3, 4], sbc801: [] },
  "سكني": { sbc201: [3, 4], sbc801: [] },
  "commercial": { sbc201: [3, 4], sbc801: [] },
  "تجاري": { sbc201: [3, 4], sbc801: [] },
  "assembly": { sbc201: [3, 4], sbc801: [] },
  "تجمع": { sbc201: [3, 4], sbc801: [] },
  
  // Height & Area
  "height": { sbc201: [5, 6], sbc801: [] },
  "ارتفاع": { sbc201: [5, 6], sbc801: [] },
  "area": { sbc201: [5, 6], sbc801: [] },
  "مساحة": { sbc201: [5, 6], sbc801: [] },
  "construction type": { sbc201: [6], sbc801: [] },
  "نوع بناء": { sbc201: [6], sbc801: [] },
  
  // Fire Resistance
  "fire resistance": { sbc201: [7], sbc801: [] },
  "مقاومة حريق": { sbc201: [7], sbc801: [] },
  "rated": { sbc201: [7], sbc801: [] },
  "interior finish": { sbc201: [8], sbc801: [] },
  "تشطيب": { sbc201: [8], sbc801: [] },
  
  // Fire Protection & Egress (most common)
  "exit": { sbc201: [10], sbc801: [] },
  "مخرج": { sbc201: [10], sbc801: [] },
  "مخارج": { sbc201: [10], sbc801: [] },
  "egress": { sbc201: [10], sbc801: [] },
  "هروب": { sbc201: [10], sbc801: [] },
  "إخلاء": { sbc201: [10], sbc801: [] },
  "stair": { sbc201: [10], sbc801: [] },
  "درج": { sbc201: [10], sbc801: [] },
  "سلم": { sbc201: [10], sbc801: [] },
  "سلالم": { sbc201: [10], sbc801: [] },
  "handrail": { sbc201: [10], sbc801: [] },
  "handrails": { sbc201: [10], sbc801: [] },
  "guardrail": { sbc201: [10], sbc801: [] },
  "guard rail": { sbc201: [10], sbc801: [] },
  "ramp": { sbc201: [10], sbc801: [] },
  "منحدر": { sbc201: [10], sbc801: [] },
  "درابزين": { sbc201: [10], sbc801: [] },
  "corridor": { sbc201: [10], sbc801: [] },
  "ممر": { sbc201: [10], sbc801: [] },
  "travel distance": { sbc201: [10], sbc801: [] },
  // "مسافة" is the bare Arabic noun "distance", not "travel distance"
  // ("مسافة سفر"). It therefore fires on BOTH senses the code uses:
  //   - exit access travel distance -> SBC 201 ch 10 "Means of Egress" (measured
  //     title), which this entry already covered;
  //   - FIRE SEPARATION DISTANCE -> SBC 201 ch 7 "Fire and Smoke Protection
  //     Features" (measured title), whose Section 705 "Exterior Walls" carries
  //     the fire-separation-distance provisions and their opening-protection
  //     table.
  // ADDED 2026-08-24 (finding 8 of the 4th adversarial review): chapter 7 is
  // measured at pp.39-322 of volume "501-1000" — 284 pages, the largest single
  // chapter in SBC 201 — and with sbc201 [10] alone this keyword reached only
  // "1001-1250" and "1251-1500". scoreFile() gives 0 to any volume outside the
  // selected ranges, so a fire-separation-distance question was silently
  // excluded from the volume that holds the answer. 10 is KEPT, not replaced:
  // travel distance is the more common reading and must stay reachable.
  "مسافة": { sbc201: [7, 10], sbc801: [] },
  "occupant load": { sbc201: [10], sbc801: [] },
  "حمل": { sbc201: [10], sbc801: [] },
  "door": { sbc201: [10], sbc801: [] },
  "باب": { sbc201: [10], sbc801: [] },
  // SBC 801 ch 7 = "Fire and Smoke Protection Features",
  // ch 9 = "Fire Protection and Life Safety Systems" (measured titles).
  // Was [6, 7, 8] / [6, 7]: ch 6 is "Building Services and Systems" and ch 8 is
  // "Interior Finish/Decorative Materials and Furnishings" — neither is fire
  // protection, and chapter 9 (the one that is) was missing.
  "fire protection": { sbc201: [9], sbc801: [7, 9] },
  "حماية": { sbc201: [9], sbc801: [7, 9] },

  // Sprinkler & Suppression
  // SBC 801 chapter 9 is the sprinkler chapter (Section 903 automatic sprinkler
  // systems). Measured, it spans volume "401-600" pp.62-200 (139 pages, the
  // largest single concentration of ch 9 in the corpus) and volume "601-800"
  // pp.1-68. The old [6, 7] reached "401-600" only because chapters 6 and 7
  // co-locate there, and never reached "601-800" at all. Adding 9 is what makes
  // the second half of the sprinkler chapter retrievable.
  "sprinkler": { sbc201: [9], sbc801: [7, 9] },
  "رش": { sbc201: [9], sbc801: [7, 9] },
  "رشاش": { sbc201: [9], sbc801: [7, 9] },
  "رشاشات": { sbc201: [9], sbc801: [7, 9] },
  // Suppression hardware is Section 903/905/906/913 — SBC 801 chapter 9, and
  // SBC 201 chapter 9 "Fire Protection Systems" (measured titles).
  // sbc201 was [] and reached SBC 201 chapters 9/10 only as a side effect of
  // getTargetChapters()'s cross-reference rule firing on the old sbc801 [6, 7].
  // Now that sbc801 is correct that side effect no longer fires, so the SBC 201
  // chapter is stated explicitly instead of being inherited by accident.
  "suppression": { sbc201: [9], sbc801: [9] },
  "إطفاء": { sbc201: [9], sbc801: [9] },
  "fire pump": { sbc201: [9], sbc801: [9] },
  "مضخة": { sbc201: [9], sbc801: [9] },
  "standpipe": { sbc201: [9], sbc801: [9] },
  "خرطوم": { sbc201: [9], sbc801: [9] },
  "water supply": { sbc201: [9], sbc801: [9] },

  // Alarm & Detection — Section 907: SBC 801 chapter 9, SBC 201 chapter 9.
  // Was sbc801 [8, 9]; chapter 8 is "Interior Finish/Decorative Materials and
  // Furnishings", not detection.
  "alarm": { sbc201: [9], sbc801: [9] },
  "إنذار": { sbc201: [9], sbc801: [9] },
  "detection": { sbc201: [9], sbc801: [9] },
  "detector": { sbc201: [9], sbc801: [9] },
  "كاشف": { sbc201: [9], sbc801: [9] },
  "كواشف": { sbc201: [9], sbc801: [9] },

  // Smoke Control & Special Systems
  // Smoke control is Section 909 (ch 9 in both codes); smoke barriers and smoke
  // partitions are chapter 7 in both codes ("Fire and Smoke Protection
  // Features" / SBC 201 "Fire and Smoke Protection Features"). Was sbc801
  // [10, 11] — ch 10 is Means of Egress and ch 11 is Existing Buildings.
  "smoke": { sbc201: [7, 9], sbc801: [7, 9] },
  "دخان": { sbc201: [7, 9], sbc801: [7, 9] },
  // Stairway pressurization is Section 909.20 (ch 9); smokeproof enclosures are
  // in ch 10 "Means of Egress" in both codes.
  "pressurization": { sbc201: [9, 10], sbc801: [9, 10] },
  "ضغط": { sbc201: [9, 10], sbc801: [9, 10] },
  // NO measured SBC 801 chapter title contains "special", so sbc801 is left
  // empty rather than invented. The old [10, 12, 13] included chapter 13, which
  // does not exist in SBC 801 at all. SBC 201 does have measured "special"
  // titles: ch 4 "Special Detailed Requirements Based on Occupancy" and ch 31
  // "Special Construction".
  "special": { sbc201: [4, 31], sbc801: [] },
  // Commercial kitchen hoods are Section 609, chapter 6 "Building Services and
  // Systems" (chapterIndex.ts lists "commercial kitchen hood" under the measured
  // chapter 6 of volume "201-400"). Was [12] = "Energy Systems".
  "kitchen": { sbc201: [], sbc801: [6] },
  "مطبخ": { sbc201: [], sbc801: [6] },

  // Scope, definitions and permits — SBC 201 ch 1 "Scope and Applicability" and
  // ch 2 "Definitions"; SBC 801 ch 1 "Scope and Administration" and ch 2
  // "Definitions" (measured titles; chapterIndex.ts also lists "permits" under
  // the measured chapters of SBC 801 volume "1-200"). ADDED 2026-08-23: without
  // these, SBC 801 volume "1-200" was reachable by no keyword at all, and the
  // only way into it was selectTargetPageRanges()'s zero-match fallback.
  "definition": { sbc201: [2], sbc801: [2] },
  "definitions": { sbc201: [2], sbc801: [2] },
  "تعريف": { sbc201: [2], sbc801: [2] },
  "تعريفات": { sbc201: [2], sbc801: [2] },
  "scope": { sbc201: [1], sbc801: [1] },
  "نطاق": { sbc201: [1], sbc801: [1] },
  "permit": { sbc201: [1], sbc801: [1] },
  "تصريح": { sbc201: [1], sbc801: [1] },
  "تصاريح": { sbc201: [1], sbc801: [1] },


  // Structural
  "structural": { sbc201: [16, 17], sbc801: [] },
  "إنشائي": { sbc201: [16, 17], sbc801: [] },
  "concrete": { sbc201: [19], sbc801: [] },
  "خرسانة": { sbc201: [19], sbc801: [] },
  "steel": { sbc201: [22], sbc801: [] },
  "حديد": { sbc201: [22], sbc801: [] },
  
  // Glass & Exterior
  "glass": { sbc201: [24], sbc801: [] },
  "زجاج": { sbc201: [24], sbc801: [] },
  "glazing": { sbc201: [24], sbc801: [] },
  "تزجيج": { sbc201: [24], sbc801: [] },
  // CORRECTED 2026-08-24 (finding 8 of the 4th adversarial review).
  // Was sbc201: [23]. SBC 201 chapter 23's MEASURED title is "Woods" — a
  // structural-material chapter. Exterior cladding is chapter 14, measured title
  // "Exterior Walls"; ./chapterIndex.ts lists "cladding", "veneer", "كسوة" and
  // "تكسية" as measured topics of volume "1251-1500", the volume whose measured
  // chapters end with 14, and repeats "exterior walls" for volume "1501-1750",
  // where chapter 14 continues (measured ch14 pp.1-5). Chapter 14 therefore
  // reaches BOTH volumes that hold it.
  // Chapter 23 is NOT retained as a secondary: no measured chapter title and no
  // measured topic list ties "Woods" to cladding, and this map's standing rule
  // is that a mapping must come from a measured title, never from a plausible
  // association (wood siding). Dropping it costs nothing in reachability —
  // volume "1751-2000" (ch 23-30) stays reachable via "glass"/"زجاج" (ch 24),
  // "gypsum"/"جبس" (25), "electrical" (27) and "elevator"/"مصعد" (30), and
  // volume "1501-1750" via "structural"/"إنشائي" (16, 17), "concrete" (19) and
  // "steel"/"حديد" (22). A query about wood as a material still routes through
  // those structural keywords; what it no longer does is send a facade question
  // to the timber chapter.
  "cladding": { sbc201: [14], sbc801: [] },
  "كسوة": { sbc201: [14], sbc801: [] },
  "gypsum": { sbc201: [25], sbc801: [] },
  "جبس": { sbc201: [25], sbc801: [] },
  
  // Electrical & Elevators
  "elevator": { sbc201: [30], sbc801: [] },
  "مصعد": { sbc201: [30], sbc801: [] },
  "مصاعد": { sbc201: [30], sbc801: [] },
  "escalator": { sbc201: [30], sbc801: [] },
  "electrical": { sbc201: [27], sbc801: [] },
  "كهربائي": { sbc201: [27], sbc801: [] },
  
  // Existing buildings
  // SBC 201 chapter 34 is RESERVED — it exists in no volume, so the old
  // sbc201: [34] reached NOTHING for all six of these keywords. SBC 801
  // chapter 11 is "Construction Requirements for Existing Buildings" (measured
  // title); SBC 201 has no existing-buildings chapter, so sbc201 stays empty
  // rather than being pointed at an unrelated chapter.
  "existing building": { sbc201: [], sbc801: [11] },
  "مباني قائمة": { sbc201: [], sbc801: [11] },
  "rehabilitation": { sbc201: [], sbc801: [11] },
  "تأهيل": { sbc201: [], sbc801: [11] },
  "additions": { sbc201: [], sbc801: [11] },
  "إضافات": { sbc201: [], sbc801: [11] },

  // Hazardous Materials (SBC 801)
  // Real numbering: ch 50 "Hazardous Materials—General", 51 Aerosols,
  // 53 Compressed Gases, 54 Corrosive Materials, 55 Cryogenic Fluids,
  // 56 Explosives and Fireworks, 57 Flammable and Combustible Liquids,
  // 58 Flammable Gases, 61 Liquefied Petroleum Gases, 63 Oxidizers.
  // The old values (19-23, 30, 37-40, 43, 46, 47, 49, 50, 51) came from the
  // invented dense sequence; 19, 40, 43, 46, 47 and 49 exist nowhere.
  "hazardous": { sbc201: [], sbc801: [50] },
  "خطر": { sbc201: [], sbc801: [50] },
  "خطرة": { sbc201: [], sbc801: [50] },
  "مواد خطرة": { sbc201: [], sbc801: [50] },
  "flammable liquid": { sbc201: [], sbc801: [57] },
  "سوائل قابلة للاشتعال": { sbc201: [], sbc801: [57] },
  "gas": { sbc201: [], sbc801: [53, 58, 61] },
  "غاز": { sbc201: [], sbc801: [53, 58, 61] },
  "غازات": { sbc201: [], sbc801: [53, 58, 61] },
  "LP-gas": { sbc201: [], sbc801: [61] },
  "غاز مسال": { sbc201: [], sbc801: [61] },

  // Explosives & Fireworks — ch 56 "Explosives and Fireworks".
  "explosive": { sbc201: [], sbc801: [56] },
  "متفجرات": { sbc201: [], sbc801: [56] },
  "fireworks": { sbc201: [], sbc801: [56] },
  "ألعاب نارية": { sbc201: [], sbc801: [56] },

  // Storage & Industrial (SBC 801)
  // ch 32 "High-Piled Combustible Storage"; ch 54 "Corrosive Materials";
  // ch 63 "Oxidizers".
  "تخزين": { sbc201: [], sbc801: [32] },
  "مستودع": { sbc201: [], sbc801: [32] },
  "corrosive": { sbc201: [], sbc801: [54] },
  "أكالة": { sbc201: [], sbc801: [54] },
  "oxidizer": { sbc201: [], sbc801: [63] },
  "مؤكسد": { sbc201: [], sbc801: [63] },

  // Fuel & special facilities
  // ch 23 "Motor Fuel-Dispensing Facilities and Repair Garages";
  // ch 35 "Welding and Other Hot Work"; ch 12 "Energy Systems" (chapterIndex.ts
  // lists "solar", "photovoltaic" and "energy storage system" under the
  // measured chapter 12 of volume "1001-1200", and "stationary storage battery"
  // under the measured chapter 6 of volume "201-400").
  "fuel": { sbc201: [], sbc801: [23] },
  "وقود": { sbc201: [], sbc801: [23] },
  "محطة وقود": { sbc201: [], sbc801: [23] },
  "welding": { sbc201: [], sbc801: [35] },
  "لحام": { sbc201: [], sbc801: [35] },
  "solar": { sbc201: [], sbc801: [12] },
  "شمسي": { sbc201: [], sbc801: [12] },
  "طاقة شمسية": { sbc201: [], sbc801: [12] },
  "battery": { sbc201: [], sbc801: [6, 12] },
  "بطارية": { sbc201: [], sbc801: [6, 12] },

  // Tents & Exhibitions
  // ch 31 "Tents and Other Membrane Structures" was already correct.
  "tent": { sbc201: [], sbc801: [31] },
  "خيمة": { sbc201: [], sbc801: [31] },
  "خيام": { sbc201: [], sbc801: [31] },
  // NO measured SBC 801 chapter title covers exhibitions and NO measured SBC 201
  // chapter title does either; the old [46] does not exist. Left deliberately
  // unmapped rather than invented — reported as an open gap, not silently filled.
  "exhibition": { sbc201: [], sbc801: [] },
  "معرض": { sbc201: [], sbc801: [] },
  "معارض": { sbc201: [], sbc801: [] },
  // No SBC 801 mall chapter (old [47] does not exist). SBC 201 chapter 4
  // "Special Detailed Requirements Based on Occupancy" is the measured home of
  // "covered mall" (chapterIndex.ts, volume "251-500").
  "mall": { sbc201: [4], sbc801: [] },
  "مركز تجاري": { sbc201: [4], sbc801: [] },

  // Laboratory, hydrogen, cryogenics, piping
  // ch 38 "Higher Education Laboratories"; ch 58 "Flammable Gases"
  // (chapterIndex.ts lists "hydrogen" under the measured chapter 58 of volume
  // "1601-1800"); ch 55 "Cryogenic Fluids".
  "laboratory": { sbc201: [], sbc801: [38] },
  "مختبر": { sbc201: [], sbc801: [38] },
  "hydrogen": { sbc201: [], sbc801: [58] },
  "هيدروجين": { sbc201: [], sbc801: [58] },
  "cryogenic": { sbc201: [], sbc801: [55] },
  "تبريد فائق": { sbc201: [], sbc801: [55] },
  // NO measured SBC 801 chapter title covers pipelines (old [36] is "Marinas");
  // left unmapped rather than invented. The Arabic "أنابيب" is different: it is
  // the stem of "أنابيب صاعدة" (standpipes), which chapterIndex.ts lists as a
  // measured topic of chapter 9 in volumes "401-600" and "601-800".
  "pipeline": { sbc201: [], sbc801: [] },
  "أنابيب": { sbc201: [], sbc801: [9] },
};

// ==================== SBC FILE RETRIEVAL (OPTIMIZED) ====================

// In-memory cache
const fileCache: Map<string, { content: string; timestamp: number }> = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX_SIZE = 30; // Increased from 20

// Query-level cache for scored results
type SourcePageMeta = { file: string; pageStart: number | null; pageEnd: number | null; precision: 'page_range' | 'chunk_range_only' | 'unavailable' };
const queryCache: Map<string, { result: { context: string; files: string[]; sourceMeta: SourcePageMeta[] }; timestamp: number }> = new Map();
const QUERY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const QUERY_CACHE_MAX = 20;

function cleanupCache() {
  if (fileCache.size <= CACHE_MAX_SIZE) return;
  const now = Date.now();
  for (const [key, val] of fileCache) {
    if (now - val.timestamp > CACHE_TTL) fileCache.delete(key);
  }
  if (fileCache.size > CACHE_MAX_SIZE) {
    const sorted = [...fileCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    while (fileCache.size > CACHE_MAX_SIZE && sorted.length) {
      fileCache.delete(sorted.shift()![0]);
    }
  }
}

function cleanupQueryCache() {
  if (queryCache.size <= QUERY_CACHE_MAX) return;
  const now = Date.now();
  for (const [key, val] of queryCache) {
    if (now - val.timestamp > QUERY_CACHE_TTL) queryCache.delete(key);
  }
  if (queryCache.size > QUERY_CACHE_MAX) {
    const sorted = [...queryCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    while (queryCache.size > QUERY_CACHE_MAX && sorted.length) {
      queryCache.delete(sorted.shift()![0]);
    }
  }
}

// ---- Bilingual SBC Technical Glossary ----
// Deduplication pass 2026-04-10: merged all duplicate keys, kept union of values.
const AR_EN_GLOSSARY: Record<string, string[]> = {
  // ── Fire systems ───────────────────────────────────────────────────────────
  "حريق": ["fire", "fire protection"],
  "الحريق": ["fire", "fire protection"],
  "إطفاء": ["suppression", "extinguishing", "fire suppression"],
  "رش": ["sprinkler", "spray"],                                        // was duplicated
  "رشاش": ["sprinkler", "nozzle", "sprinkler head"],                   // merged: added "sprinkler head"
  "الرش": ["sprinkler"],
  "رشاشات": ["sprinklers", "sprinkler system", "automatic sprinkler"], // merged: added "sprinkler system","automatic sprinkler"
  "إنذار": ["alarm", "detection", "notification", "alert"],            // merged: added "alert"
  "كاشف": ["detector", "sensor"],                                      // was duplicated
  "كواشف": ["detectors", "sensors"],
  "مضخة": ["pump", "fire pump"],                                       // was duplicated
  "خرطوم": ["hose", "standpipe"],
  "طفاية": ["extinguisher"],
  // ── Compound fire-system phrases (unique — kept from added-terms block) ───
  "مقاومة حريق": ["fire resistance", "fire-resistance rating"],
  "حمل إشغال": ["occupant load", "occupancy load"],
  "مسافة سفر": ["travel distance", "exit travel"],
  "كاشف دخان": ["smoke detector", "smoke detection"],
  "كاشف حرارة": ["heat detector", "thermal detector"],
  "نظام رش": ["sprinkler system", "automatic sprinkler"],
  "إنذار حريق": ["fire alarm", "fire alarm system"],
  "مضخة حريق": ["fire pump", "fire pump system"],
  "صاعد": ["standpipe", "riser", "vertical pipe"],
  "صاعد مائي": ["standpipe", "standpipe system"],
  "حاجز حريق": ["fire barrier", "fire wall", "fire separation"],
  "جدار حريق": ["fire wall", "firewall", "fire barrier"],
  "فاصل حريق": ["fire separation", "fire partition"],
  "مقاومة للحريق": ["fire-rated", "fire resistant", "fire resistance"],
  "تحكم دخان": ["smoke control", "smoke management"],
  "مانع دخان": ["smoke barrier", "smoke partition"],
  // ── Building elements ─────────────────────────────────────────────────────
  "مقاومة": ["resistance", "fire resistance", "rated", "rating"],      // merged: added "rating"
  "تصنيف": ["classification", "rating", "type"],                       // was duplicated
  "مبنى": ["building", "structure"],
  "مباني": ["buildings", "structures"],
  "بناء": ["building", "construction"],
  "إنشاء": ["construction", "building construction"],
  "نوع إنشاء": ["construction type", "type of construction"],
  "ارتفاع": ["height", "elevation", "rise", "building height"],        // merged: added "building height"
  "مساحة": ["area", "floor area", "square", "allowable area"],         // merged: added "allowable area"
  "مساحة أرضية": ["floor area", "allowable area"],
  "طابق": ["floor", "story", "storey", "level"],                       // was duplicated; kept richer first form
  "طوابق": ["floors", "stories", "storeys", "levels"],                 // was duplicated; kept richer first form
  "أدوار": ["stories", "floors", "levels"],
  "دور": ["story", "floor", "level"],
  "سقف": ["roof", "ceiling"],
  "جدار": ["wall", "partition"],
  "جدران": ["walls", "partitions"],
  "عمود": ["column", "pillar"],
  "دخان": ["smoke", "smoke control"],
  // ── Occupancy ─────────────────────────────────────────────────────────────
  "إشغال": ["occupancy", "occupant", "use"],                           // was duplicated
  "قسم": ["section", "division"],
  "مجموعة": ["group", "occupancy group"],
  "سكني": ["residential", "dwelling", "R-occupancy"],
  "تجاري": ["commercial", "mercantile", "business", "M-occupancy", "B-occupancy"],
  "صناعي": ["industrial", "factory", "F-occupancy"],
  "تعليمي": ["educational", "E-occupancy"],
  "مختلط": ["mixed", "mixed-use", "mixed occupancy"],
  "تجمع": ["assembly", "A-occupancy", "gathering"],
  "تخزين": ["storage", "S-occupancy", "warehouse"],
  "مستشفى": ["hospital", "health care", "I-occupancy"],
  "فندق": ["hotel", "R-1", "transient"],
  "شقق": ["apartments", "dwelling units", "R-2"],
  "فلل": ["villas", "dwelling", "R-3"],
  "مسكن": ["dwelling", "residence", "habitable"],
  "وحدات": ["units", "dwelling units"],
  "وحدة": ["unit", "dwelling unit"],
  // ── Egress ────────────────────────────────────────────────────────────────
  "مخرج": ["exit", "egress", "means of egress"],                       // was duplicated
  "مخارج": ["exits", "egress", "means of egress"],
  "مخرج طوارئ": ["emergency exit", "exit"],
  "طوارئ": ["emergency", "emergency exit"],
  "مسار هروب": ["means of egress", "escape route", "exit path"],
  "هروب": ["escape", "egress", "evacuation"],                          // was duplicated
  "إخلاء": ["evacuation", "egress"],                                   // was duplicated
  "ممر": ["corridor", "passage", "aisle", "hallway"],                  // was duplicated; kept richer first form
  "درج": ["stair", "stairway", "staircase"],                           // was duplicated
  "سلم": ["stair", "stairway", "ladder"],                              // was duplicated
  "سلالم": ["stairs", "stairways", "staircases"],
  "مصعد": ["elevator", "lift"],
  "درابزين": ["handrail", "handrails", "guardrail", "railing", "guard"],
  "منحدر": ["ramp", "ramped aisle", "slope"],
  "سفر": ["travel", "travel distance"],
  "مسافة": ["distance", "travel distance", "separation"],
  "عرض": ["width", "breadth"],
  "طول": ["length", "height"],
  // ── Openings ──────────────────────────────────────────────────────────────
  "باب": ["door", "doorway", "opening"],
  "أبواب": ["doors", "doorways"],
  "فتحة": ["opening", "aperture", "penetration"],                      // merged: added "penetration"
  "فتحات": ["openings", "apertures", "penetrations"],                  // merged: added "penetrations"
  // ── Loads & capacity ─────────────────────────────────────────────────────
  "حمل": ["load", "occupant load", "capacity"],
  "سعة": ["capacity", "occupancy load"],
  // ── MEP ──────────────────────────────────────────────────────────────────
  "نظام": ["system", "installation"],
  "أنظمة": ["systems", "installations"],
  "تهوية": ["ventilation", "HVAC", "air"],
  "هواء": ["air", "ventilation"],
  "الهواء": ["air", "ventilation", "air supply"],
  "تكييف": ["air conditioning", "HVAC", "cooling"],
  "كهرباء": ["electrical", "electric", "power"],
  "سباكة": ["plumbing", "piping"],
  "ضغط": ["pressure", "pressurization"],
  "تعويض": ["compensation", "make-up", "makeup air"],
  "التعويض": ["compensation", "make-up air", "makeup"],
  "مراوح": ["fans", "blowers"],
  // ── Code references ───────────────────────────────────────────────────────
  "متطلبات": ["requirements", "provisions", "criteria"],
  "اشتراطات": ["requirements", "provisions", "regulations"],
  "لائحة": ["regulation", "code", "standard"],
  "كود": ["code", "standard"],
  "مادة": ["section", "clause", "article"],
  "فصل": ["chapter", "section"],
  "جدول": ["table", "schedule"],
  "ملحق": ["appendix", "annex", "supplement"],
  "تصريح": ["permit", "approval"],
  // ── Materials ─────────────────────────────────────────────────────────────
  "خرسانة": ["concrete", "reinforced concrete"],
  "حديد": ["steel", "iron", "metal"],
  "خشب": ["wood", "timber", "combustible"],
  "عازل": ["insulation", "barrier", "fire barrier"],
  "حاجز": ["barrier", "separation", "fire barrier"],
  // ── Safety ────────────────────────────────────────────────────────────────
  "حماية": ["protection", "fire protection", "safeguard"],
  "وقاية": ["prevention", "protection", "safety"],
  "سلامة": ["safety", "life safety"],
  "تلقائي": ["automatic", "auto"],
  "يدوي": ["manual", "hand-operated"],
};

// ---- Smart Chunk Scoring (OPTIMIZED) ----
interface ScoredChunk {
  text: string;
  score: number;
  source: string;
  pageStart?: number | null;
  pageEnd?: number | null;
}

function buildQueryKeywords(query: string): string[] {
  const raw = query.toLowerCase();
  const arabicTokens = raw.split(/[\s,،.؟?!:;()\[\]{}"']+/).filter(t => t.length > 2);
  
  const englishTokens: string[] = [];
  for (const token of arabicTokens) {
    const translations = AR_EN_GLOSSARY[token];
    if (translations) {
      englishTokens.push(...translations);
    }
  }
  
  for (const [arWord, enWords] of Object.entries(AR_EN_GLOSSARY)) {
    if (raw.includes(arWord) && !arabicTokens.includes(arWord)) {
      englishTokens.push(...enWords);
    }
  }
  
  const tokens = [...arabicTokens, ...englishTokens];
  
  const patterns = [
    "sbc 201", "sbc 801", "sbc201", "sbc801",
    // Chapter 4 — Special Detailed Requirements
    "section 403", "section 406", "403.1", "406.5", "406.6",
    "high-rise", "high rise", "open parking", "enclosed parking",
    // Chapter 5 — Heights, Areas, Incidental Uses
    "table 504", "table 506", "table 509", "504.3", "504.4", "506.2", "509",
    // Chapter 6 — Construction Types
    "table 601", "table 602", "601", "602",
    // Chapter 7 — Fire & Smoke Protection
    "table 705", "705.8",
    // Chapter 10 — Means of Egress + Assembly
    "table 1004", "table 1005", "table 1006", "table 1011",
    "table 1017", "table 1018", "table 1020", "table 1021", "table 1029",
    "section 1004", "section 1005", "section 1006", "section 1011",
    "section 1017", "section 1018", "section 1020", "section 1021", "section 1029",
    "1004.5", "1005.1", "1006.3", "1011.2", "1017.2", "1018.1", "1020.1", "1021.2",
    "1029.6",
    // SBC 801 — Fire Suppression
    "table 903", "section 903", "903.2", "903.3",
  ];
  for (const p of patterns) {
    if (raw.includes(p)) tokens.push(p);
  }

  // --- Auto-extract section numbers (e.g., 903.2, 1006.3.4) ---
  const sectionNumRegex = /\b(\d{3,4}\.\d{1,2}(?:\.\d{1,2})?)\b/g;
  let sMatch;
  while ((sMatch = sectionNumRegex.exec(raw)) !== null) {
    tokens.push(sMatch[1]); // "903.2"
    const parent = sMatch[1].split(".").slice(0, 2).join(".");
    if (parent !== sMatch[1]) tokens.push(parent); // parent "903.2" from "903.2.1"
    tokens.push("section " + sMatch[1]);
  }

  // --- Auto-extract table references (e.g., "table 903.2", "جدول 903") ---
  const tableRefRegex = /(?:table|جدول)\s*(\d{1,4}(?:\.\d{1,2})?)/gi;
  let tMatch;
  while ((tMatch = tableRefRegex.exec(raw)) !== null) {
    tokens.push("table " + tMatch[1].toLowerCase());
    tokens.push(tMatch[1].toLowerCase());
  }

  // --- Auto-extract occupancy groups (e.g., "Group B", "مجموعة A-2") ---
  const groupRegex = /(?:group|مجموعة)\s*([a-u](?:-\d)?)/gi;
  let gMatch;
  while ((gMatch = groupRegex.exec(raw)) !== null) {
    tokens.push("group " + gMatch[1].toLowerCase());
  }

  // --- Auto-extract construction types (e.g., "Type V-B", "نوع I-A") ---
  const typeRegex = /(?:type|نوع)\s*((?:i{1,3}|iv|v)(?:-[ab])?)/gi;
  let cMatch;
  while ((cMatch = typeRegex.exec(raw)) !== null) {
    tokens.push("type " + cMatch[1].toLowerCase());
  }

  const uniqueTokens = [...new Set(tokens)];
  
  console.log(`🔤 Keywords: ${uniqueTokens.length} (${arabicTokens.length} ar + ${englishTokens.length} en)`);
  
  return uniqueTokens;
}

// ---- QueryMeta for structured scoring ----
interface QueryMeta {
  sectionNumbers: string[];   // ["903.2", "1006.3"]
  tableRefs: string[];        // ["table 903.2", "903"]
  occupancyGroups: string[];  // ["group b"]
  constructionTypes: string[]; // ["type v-b"]
  exactPhrases: string[];     // ["automatic sprinkler", "نظام رش"]
}

const DOMAIN_PHRASES = [
  "automatic sprinkler", "fire alarm", "fire alarm system", "fire barrier",
  "fire wall", "fire separation", "fire resistance", "fire-resistance rating",
  "fire pump", "fire pump system", "fire protection", "fire department",
  "means of egress", "travel distance", "exit access", "exit discharge",
  "occupant load", "occupancy group", "smoke control", "smoke detector",
  "smoke barrier", "standpipe system", "standpipe", "construction type",
  "type of construction", "floor area", "building height", "allowable area",
  "fire command", "emergency exit",
  "نظام رش", "نظام إنذار", "إنذار حريق", "مسافة سفر", "حمل إشغال",
  "مقاومة حريق", "حاجز حريق", "جدار حريق", "كاشف دخان", "مضخة حريق",
  "مخرج طوارئ", "تحكم دخان", "صاعد مائي", "نظام رش تلقائي",
  "مسار هروب", "فاصل حريق", "مقاومة للحريق",
];

function buildQueryMeta(query: string): QueryMeta {
  const raw = query.toLowerCase();
  const meta: QueryMeta = {
    sectionNumbers: [],
    tableRefs: [],
    occupancyGroups: [],
    constructionTypes: [],
    exactPhrases: [],
  };

  // Extract section numbers
  const secRegex = /\b(\d{3,4}\.\d{1,2}(?:\.\d{1,2})?)\b/g;
  let m;
  while ((m = secRegex.exec(raw)) !== null) {
    meta.sectionNumbers.push(m[1]);
  }

  // Extract table references
  const tblRegex = /(?:table|جدول)\s*(\d{1,4}(?:\.\d{1,2})?)/gi;
  while ((m = tblRegex.exec(raw)) !== null) {
    meta.tableRefs.push("table " + m[1].toLowerCase());
  }

  // Extract occupancy groups
  const grpRegex = /(?:group|مجموعة)\s*([a-u](?:-\d)?)/gi;
  while ((m = grpRegex.exec(raw)) !== null) {
    meta.occupancyGroups.push("group " + m[1].toLowerCase());
  }

  // Extract construction types
  const typRegex = /(?:type|نوع)\s*((?:i{1,3}|iv|v)(?:-[ab])?)/gi;
  while ((m = typRegex.exec(raw)) !== null) {
    meta.constructionTypes.push("type " + m[1].toLowerCase());
  }

  // Extract domain exact phrases
  for (const phrase of DOMAIN_PHRASES) {
    if (raw.includes(phrase.toLowerCase())) {
      meta.exactPhrases.push(phrase.toLowerCase());
    }
  }

  console.log(`🔍 QueryMeta: sections=${meta.sectionNumbers.join(",")}, tables=${meta.tableRefs.join(",")}, groups=${meta.occupancyGroups.join(",")}, types=${meta.constructionTypes.join(",")}, phrases=${meta.exactPhrases.length}`);
  return meta;
}

function scoreChunk(chunkText: string, keywords: string[], queryMeta?: QueryMeta): number {
  const lower = chunkText.toLowerCase();
  let score = 0;
  
  // Penalize very short chunks
  if (chunkText.length < 100) return 0;
  
  for (const kw of keywords) {
    const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = lower.match(regex);
    if (matches) {
      // SBC references get 3x weight
      const weight = /^(sbc|table|section|\d{3}\.\d)/.test(kw) ? 3 : 1;
      score += matches.length * weight;
    }
  }
  
  // Bonus for chunks containing tables
  if (/\btable\s+\d+/i.test(lower) || /جدول\s+\d+/.test(lower)) {
    score += 5;
  }
  
  // Bonus for chunks with specific section numbers (e.g., 903.2.1, 1006.3.4)
  const sectionMatches = lower.match(/\d{3,4}\.\d+(\.\d+)?/g);
  if (sectionMatches && sectionMatches.length > 0) {
    score += Math.min(sectionMatches.length * 2, 10);
  }

  // --- QueryMeta-based precision scoring (backward compatible) ---
  if (queryMeta) {
    // 1. Section Number Exact Match (×5 per match)
    for (const sec of queryMeta.sectionNumbers) {
      const secEscaped = sec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${secEscaped}\\b`).test(lower)) {
        score += 5;
      }
    }

    // 2. Table Reference Match (×4 per match)
    for (const tbl of queryMeta.tableRefs) {
      const tblEscaped = tbl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(tblEscaped, "i").test(lower)) {
        score += 4;
      }
    }

    // 3. Exact Phrase Match (×3 per phrase)
    for (const phrase of queryMeta.exactPhrases) {
      if (lower.includes(phrase)) {
        score += 3;
      }
    }

    // 4. Occupancy Group Match (×3 per match)
    for (const grp of queryMeta.occupancyGroups) {
      const grpEscaped = grp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(grpEscaped, "i").test(lower)) {
        score += 3;
      }
    }

    // 5. Construction Type Match (×3 per match)
    for (const typ of queryMeta.constructionTypes) {
      const typEscaped = typ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(typEscaped, "i").test(lower)) {
        score += 3;
      }
    }
  }

  // Bonus for chapter headings
  if (/\bchapter\s+\d+/i.test(lower) || /الفصل\s+\d+/.test(lower)) {
    score += 3;
  }

  return score;
}

function extractAndScoreChunks(rawJson: string, fileName: string, keywords: string[], queryMeta?: QueryMeta): ScoredChunk[] {
  const scored: ScoredChunk[] = [];

  try {
    const parsed = JSON.parse(rawJson);

    let chunks: any[] = [];

    if (Array.isArray(parsed)) {
      chunks = parsed;
    } else if (parsed.chunks && Array.isArray(parsed.chunks)) {
      chunks = parsed.chunks;
    } else if (parsed.sections && Array.isArray(parsed.sections)) {
      chunks = parsed.sections;
    } else if (parsed.content && typeof parsed.content === "string") {
      const sections = parsed.content.split(/(?=(?:Chapter|Section|Article|المادة|الفصل|الباب)\s)/i);
      chunks = sections.map((s: string) => ({ text: s, content: s }));
    } else {
      const text = JSON.stringify(parsed);
      const s = scoreChunk(text, keywords, queryMeta);
      if (s > 0) scored.push({ text: text.slice(0, 5000), score: s, source: fileName });
      return scored;
    }

    for (const chunk of chunks) {
      const text = typeof chunk === "string"
        ? chunk
        : (chunk.text || chunk.content || chunk.body || JSON.stringify(chunk));

      if (!text || text.length < 20) continue;

      const s = scoreChunk(text, keywords, queryMeta);
      // Only include chunks with score > 0 (skip irrelevant chunks)
      if (s > 0) {
        let pageStart = typeof chunk !== "string" ? (chunk.page_start ?? null) : null;
        let pageEnd = typeof chunk !== "string" ? (chunk.page_end ?? null) : null;
        // Normalize: ensure pageStart ≤ pageEnd by swapping if reversed
        if (pageStart !== null && pageEnd !== null && pageStart > pageEnd) {
          [pageStart, pageEnd] = [pageEnd, pageStart];
        }
        scored.push({ text, score: s, source: fileName, pageStart, pageEnd });
      }
    }
  } catch {
    const s = scoreChunk(rawJson, keywords, queryMeta);
    if (s > 0) scored.push({ text: rawJson.slice(0, 5000), score: s, source: fileName });
  }

  return scored;
}

// ---- Determine target chapters from query ----
function getTargetChapters(query: string): { sbc201Chapters: number[]; sbc801Chapters: number[] } {
  const lower = query.toLowerCase();
  const sbc201Chapters = new Set<number>();
  const sbc801Chapters = new Set<number>();

  // Check keyword map against English terms
  for (const [keyword, chapters] of Object.entries(CHAPTER_KEYWORDS)) {
    if (lower.includes(keyword)) {
      chapters.sbc201.forEach(c => sbc201Chapters.add(c));
      chapters.sbc801.forEach(c => sbc801Chapters.add(c));
    }
  }

  // Also translate Arabic keywords via glossary and check CHAPTER_KEYWORDS
  for (const [arWord, enWords] of Object.entries(AR_EN_GLOSSARY)) {
    if (lower.includes(arWord)) {
      for (const enWord of enWords) {
        const chapters = (CHAPTER_KEYWORDS as Record<string, { sbc201: number[]; sbc801: number[] }>)[enWord];
        if (chapters) {
          chapters.sbc201.forEach(c => sbc201Chapters.add(c));
          chapters.sbc801.forEach(c => sbc801Chapters.add(c));
        }
      }
    }
  }

  // Check for explicit chapter numbers
  const chapterMatch = lower.match(/(?:chapter|فصل)\s*(\d+)/gi);
  if (chapterMatch) {
    for (const m of chapterMatch) {
      const num = parseInt(m.match(/\d+/)![0]);
      if (num <= 35) {
        sbc201Chapters.add(num);
        sbc801Chapters.add(num);
      }
    }
  }

  // Check for explicit section numbers (e.g., 903.2 -> chapter 9, or "Section 1014" bare)
  const sectionMatch = lower.match(/(?:section\s+)?(\d{3,4})\.\d/gi);
  // Also match bare integer section numbers when preceded by "section" / Arabic article forms / "clause"
  const bareSectionMatch = lower.match(/(?:section|(?:ال)?مادة|clause)\s+(\d{3,4})\b/gi);
  const allSectionMatches = [...(sectionMatch || []), ...(bareSectionMatch || [])];
  if (allSectionMatches.length > 0) {
    for (const m of allSectionMatches) {
      const secNum = parseInt(m.match(/(\d{3,4})/)?.[1] || "0");
      const chapNum = Math.floor(secNum / 100);
      if (chapNum > 0 && chapNum <= 35) {
        // SBC 801 sections 9xx are chapters 6-9, SBC 201 sections 10xx are chapter 10
        if (secNum >= 900 && secNum < 1000) {
          sbc201Chapters.add(9);
          sbc801Chapters.add(Math.min(chapNum, 14));
        } else if (secNum >= 1000 && secNum < 1100) {
          sbc201Chapters.add(10);
        } else {
          sbc201Chapters.add(chapNum);
        }
      }
    }
  }
  
  // Cross-referencing: always include both codes for fire/egress
  if (sbc201Chapters.has(9) || sbc201Chapters.has(10)) {
    sbc801Chapters.add(6);
    sbc801Chapters.add(7);
  }
  if (sbc801Chapters.has(6) || sbc801Chapters.has(7)) {
    sbc201Chapters.add(9);
    sbc201Chapters.add(10);
  }
  
  return {
    sbc201Chapters: [...sbc201Chapters],
    sbc801Chapters: [...sbc801Chapters],
  };
}

// ── 2024 source-intake codes (SBC 401 electrical / SBC 501 mechanical) ──────
// Default OFF. Accepted values (gate result 2026-08-31 forced per-code
// granularity — SBC501 passed its benchmark gate at 94%, SBC401 failed at 56%
// and must stay dark until its retrieval improves):
//   unset/""        → no new codes (byte-identical to HEAD)
//   "1"             → both codes (legacy meaning, kept)
//   "SBC501"        → only that code; comma list allowed ("SBC401,SBC501")
// A code may appear here ONLY after ITS OWN gate passes — the prompt contract
// names exactly the enabled set, never the other code.
// ── Multi-topic retrieval (2026-08-31) ──────────────────────────────────────
// A compound question ("grease duct AND hood type AND shaft fire rating", or a
// numbered 4-part strategy request) produces ONE blended embedding, and the
// nearest neighbours of that blend serve no single topic well. Measured in
// production: the kitchen question returned Section 510 (HAZARDOUS exhaust —
// laboratories) instead of 506/507 (commercial kitchen grease duct + Type I
// hood) even though 506.1/507.5.2 are in the corpus and a focused gate query
// finds 506.1 at rank 1; the 4-part strategy question retrieved one generic
// SBC 801 Chapter-4 narrative chunk and the answer came back littered with
// [NO SOURCE].
//
// Fix: split the question into its topics, retrieve for each in parallel with
// that topic's own code filter, and merge. Default OFF
// (ADVISORY_MULTI_QUERY_RETRIEVAL_ENABLED must equal "1"); flag off ⇒ the
// single-query path below is untouched.
export const MULTI_QUERY_MAX_SUBQUERIES = 4;
/** Chunks taken per sub-topic — enough to carry a requirement + its context. */
const PER_SUBTOPIC_LIMIT = 3;
/** Primary matches kept ahead of the sub-topic hits in the context ordering. */
const MULTI_QUERY_PRIMARY_HEAD = 10;

/**
 * Split a compound question into focused sub-queries. Pure + exported for tests.
 * Returns [] when the question is short or has no compound structure, which is
 * the signal to keep the single-query path.
 */
export function decomposeQuery(raw: string): string[] {
  const q = (raw ?? "").replace(/\s+/g, " ").trim();
  if (q.length < 60) return [];

  // Enumerators the model is actually asked with: "(1)", "1.", "١." ...
  const enumRx = /\s*[(（]\s*[0-9٠-٩]{1,2}\s*[)）]\s*|\s+[0-9٠-٩]{1,2}\s*[.\-–)]\s+/u;
  let parts = q.split(enumRx);

  // With a real enumeration, parts[0] is the preamble (the scenario + "give me
  // the strategy"). Drop it: the PRIMARY query already embeds the whole
  // question, so spending a sub-query slot on the preamble would push a real
  // topic past MAX — measured on the 5-storey question, where keeping it cost
  // the electrical/RCD topic, the very one that had been missing.
  if (parts.length >= 3) {
    parts = parts.slice(1);
  } else {
    // No enumeration → split on clause joins that separate distinct asks:
    // Arabic "، وكيف/وما/وأين", a second question mark, or ";".
    parts = q.split(/؟\s*|\s*[;؛]\s*|،\s*(?=و?كيف|و?ما|وأين|وهل)|\s+(?=وكيف\s|وأين\s)/u);
  }

  const out: string[] = [];
  for (const p of parts) {
    const s = p.replace(/^[\s،:.-]+|[\s،:.-]+$/g, "").trim();
    // Drop fragments too short to embed meaningfully, and near-duplicates.
    if (s.length < 15) continue;
    if (out.some((o) => o === s)) continue;
    out.push(s);
    if (out.length >= MULTI_QUERY_MAX_SUBQUERIES) break;
  }
  // One part means the split found no real structure — keep the single path.
  return out.length >= 2 ? out : [];
}

/**
 * The code filter for one piece of text. Identical regexes, same order, as the
 * chain that has always run inline in fetchSBCContextVector — extracted so a
 * sub-query can be routed to ITS own code instead of inheriting the whole
 * question's. `enabled` gates the 2024-intake codes exactly as before.
 */
export function detectFilterCodeFor(text: string, enabled: string[]): string | null {
  if (text.match(/801|حماية.*حري|fire.*protect|رشاش|sprinkler|إنذار|alarm|إطفاء/i)) return "SBC801";
  // Boundary guards, NOT cosmetic — this chain picks the single code the whole
  // question is filtered by, so a false positive sends the entire retrieval to
  // the wrong corpus. Measured on the owner's own test question: "وكيف تتقاطع
  // مع متطلبات مقاومة الحريق" matched "قاطع" (breaker) inside "تتقاطع"
  // (intersect), routed a commercial-kitchen question to SBC 401 (electrical),
  // returned nothing usable, fell through to the keyword path, and the answer
  // came back citing Section 510 (hazardous exhaust) instead of 506/507
  // (grease duct + Type I hood). Same class of bug: "درج" (stair) inside
  // "درجة" (degree) — guarded on the trailing side because the real word
  // carries the definite article ("الدرج").
  if (text.match(/201|بناء.*عام|general.*build|مخرج|exit|درج(?![ء-ي])|stair/i)) return "SBC201";
  if (enabled.includes("SBC401") && text.match(/401|كهرب|electric|تأريض|earthing|grounding|صواعق|lightning|(?<!ت)قاطع|breaker|كابل|cable|wiring|تمديدات/i)) return "SBC401";
  if (enabled.includes("SBC501") && text.match(/501|ميكانيك|mechanical|تهوية|ventilat|عادم|exhaust|دكت|duct|غلاية|boiler|تبريد|refrigerat|مدخنة|chimney/i)) return "SBC501";
  return null;
}

/**
 * Every code a SUB-TOPIC touches, not just the first — used only by the
 * multi-topic path. One sub-topic legitimately spans codes: "standby power for
 * the fire pump and the alarm panel, and RCD selection" is SBC 801 *and* SBC
 * 401, and the single-winner chain above would silently drop the electrical
 * half (measured: that is exactly how the RCD topic went missing). The sub-query
 * is embedded ONCE and the embedding reused per code, so the extra cost is a
 * cheap RPC, not another embedding call.
 *
 * The patterns are the singular chain's, widened for phrasings that were
 * measured to miss: kitchen-hood/grease wording never hit the SBC 501 set, and
 * Arabic shadda/plural forms ("الرشّاشات", "المخارج") never hit "رشاش"/"مخرج".
 * Returns [null] (unfiltered search) when nothing matches — same as before.
 */
export function detectFilterCodesFor(text: string, enabled: string[]): (string | null)[] {
  const codes: string[] = [];
  if (text.match(/801|حماية.*حري|fire.*protect|رشا?ّ?ش|sprinkler|إنذار|alarm|إطفاء|مضخة.*حريق|fire.*pump/i)) codes.push("SBC801");
  // Short Arabic tokens need explicit boundaries or they fire inside unrelated
  // words — both cases below were measured, not hypothesised:
  //   "قاطع" (breaker) fires inside "تتقاطع" (intersect) → needs a LEADING
  //     guard (?<![ء-ي]); the plural "قواطع" has no contiguous "قاطع" and is
  //     caught by "RCD"/"كهرب" instead.
  //   "درج" (stair) fires inside "درجة" (degree) → needs a TRAILING guard
  //     (?![ء-ي]); a leading guard cannot be used here because the definite
  //     article makes the real word "الدرج".
  if (text.match(/201|بناء.*عام|general.*build|مخ(ر|ا?ر)ج|exit|egress|هروب|درج(?![ء-ي])|stair|منور|shaft|إشغال|occupan/i)) codes.push("SBC201");
  if (enabled.includes("SBC401") && text.match(/401|كهرب|electric|تأريض|earthing|grounding|صواعق|lightning|(?<!ت)قاطع|breaker|RCD|كابل|cable|wiring|تمديدات|طاقة.*احتياط|standby.*power|مولد|generator/i)) codes.push("SBC401");
  if (enabled.includes("SBC501") && text.match(/501|ميكانيك|mechanical|تهوية|ventilat|عادم|exhaust|دكت|duct|غلاية|boiler|تبريد|refrigerat|مدخنة|chimney|مطبخ|kitchen|شفّ?اط|hood|شحوم|grease|دخان|smoke/i)) codes.push("SBC501");
  if (codes.length === 0) return [null];
  return codes.slice(0, 2);   // two is enough; keeps the RPC fan-out bounded
}

// ── Cross-lingual embedding gap (2026-09-01) ────────────────────────────────
// The corpus is English; most questions are Arabic. Measured against production
// with the SAME embedding model on both sides:
//   "ما متطلبات نظام الرشاشات التلقائية…"  -> None(0.52) 5601.3(0.51)  = noise
//   same + "automatic sprinkler system"     -> 903.3.1(0.68) 402.5(0.67) = right
//   "مسافة الهروب والمخارج"                 -> 506.2(0.52) 415.11.1     = noise
//   same + "travel distance exits egress"   -> 1006.3(0.71) 1017.3(0.70) = right
// English questions were always fine (0.74-0.76), so this is not a broken
// index — it is a weak cross-lingual signal that gets swamped once the corpus
// is large. It bites SBC 201/801 (4,630 rows) far harder than SBC 401/501
// (923 rows), which is why the new codes passed their Arabic gates while the
// two core codes returned referenced-standards tables for egress questions.
//
// Fix: append the English domain terms an Arabic question implies before
// embedding. The pairs are derived from CHAPTER_KEYWORDS itself — it is
// authored as an English term immediately followed by its Arabic
// equivalent(s) for the same chapters — so the glossary cannot drift from the
// keyword map it came from.
let arEnTermsCache: Record<string, string> | null = null;
function arEnTerms(): Record<string, string> {
  if (arEnTermsCache) return arEnTermsCache;
  const out: Record<string, string> = {};
  let lastEn: string | null = null;
  for (const k of Object.keys(CHAPTER_KEYWORDS)) {
    if (/[؀-ۿ]/.test(k)) {
      if (lastEn) out[k] = lastEn;
    } else {
      lastEn = k;
    }
  }
  arEnTermsCache = out;
  return out;
}

/**
 * Append the English domain terms an Arabic query implies, for embedding ONLY.
 * Returns the text unchanged when it has no Arabic or no term matches, so an
 * English question and an unmatched question both behave exactly as before.
 * Exported for tests.
 */
export function augmentQueryForEmbedding(q: string): string {
  const text = q ?? "";
  if (!/[؀-ۿ]/.test(text)) return text;
  const hits = new Set<string>();
  for (const [ar, en] of Object.entries(arEnTerms())) {
    if (text.includes(ar)) hits.add(en);
  }
  if (hits.size === 0) return text;
  return `${text} ${[...hits].join(" ")}`;
}

/** Owning code of a retrieved chunk, derived from its storage filename.
 *  Both naming schemes are covered: "SBC 201 - The Saudi General Building
 *  Code-1-250_extracted_chunks.json" and "SBC501_CC2024_305-509_chunks.json". */
export function codeFromFileName(fileName: string | null | undefined): string {
  const f = String(fileName ?? "");
  if (/^SBC[\s_-]*201\b/i.test(f)) return "SBC-201";
  if (/^SBC[\s_-]*801\b/i.test(f)) return "SBC-801";
  if (/^SBC[\s_-]*501(?!\d)/i.test(f)) return "SBC-501";
  if (/^SBC[\s_-]*401(?!\d)/i.test(f)) return "SBC-401";
  return "UNKNOWN";
}

function bilingualEmbeddingEnabled(): boolean {
  return (Deno.env.get("ADVISORY_BILINGUAL_EMBEDDING_ENABLED") ?? "").trim() === "1";
}

// ── Runtime citation verifier (B1a, ./citationVerifier.ts) ──────────────────
// OFF by default. With the flag off the wire output is byte-identical to what
// it was before this feature existed: transformStream still emits [DONE] on
// finishReason STOP and in flush, and pipeTo still closes the stream. With it
// on, transformStream stops emitting [DONE] and the stream tail moves to the
// post-pipe block, which emits ONE {type:"citations"} event and then the single
// [DONE]. Ordering is load-bearing — the client stops reading at [DONE].
function citationVerifierEnabled(): boolean {
  return (Deno.env.get("CITATION_VERIFIER_ENABLED") ?? "").trim() === "1";
}

// ── External-clause scrubber (./externalClauseScrubber.ts) ─────────────────
// Structural enforcement of SOURCE_SCOPE rule 3: clause/table/page numbers
// attached to standards the corpus does not hold (NFPA 13 Section 8.15.1)
// are reduced to the bare standard name inside the stream, before the client
// sees them. OFF by default; with the flag off transformStream forwards
// every delta untouched, exactly as before.
function externalClauseScrubEnabled(): boolean {
  return (Deno.env.get("EXTERNAL_CLAUSE_SCRUB_ENABLED") ?? "").trim() === "1";
}

// ── Per-user durable memory (2026-09-01, flag USER_MEMORY_ENABLED) ──────────
// One compact document per user in public.user_memory (RLS: owner-only), so
// the assistant recognises the account across conversations — the user's name,
// role, company, and projects — without ever mixing users: reads/writes are
// keyed strictly by the authenticated userId, and the table's policies allow
// no cross-user path. The memory is BACKGROUND PERSONALISATION context, never
// a code source; the injection block says so explicitly.
function userMemoryEnabled(): boolean {
  return (Deno.env.get("USER_MEMORY_ENABLED") ?? "").trim() === "1";
}

const USER_MEMORY_MAX_CHARS = 1600;

async function fetchUserMemory(adminClient: any, userId: string): Promise<string> {
  try {
    const { data } = await adminClient
      .from("user_memory")
      .select("content")
      .eq("user_id", userId)
      .maybeSingle();
    const c = typeof data?.content === "string" ? data.content.trim() : "";
    return c.slice(0, USER_MEMORY_MAX_CHARS);
  } catch {
    return "";
  }
}

/**
 * Post-answer background task: merge durable facts from the user's latest
 * message into their memory document. Runs AFTER the response is returned
 * (EdgeRuntime.waitUntil) so it adds zero latency to the chat; every failure
 * is swallowed — memory is an enhancement, never a dependency.
 */
async function updateUserMemoryInBackground(
  adminClient: any,
  apiKey: string,
  userId: string,
  existingMemory: string,
  latestUserMessage: string,
): Promise<void> {
  try {
    const msg = (latestUserMessage ?? "").trim();
    if (msg.length < 12) return; // nothing extractable
    const prompt =
      `أنت مُحدِّث ذاكرة حساب في منصة استشارات هندسية. أمامك ذاكرة الحساب الحالية ورسالة جديدة من صاحب الحساب.\n` +
      `مهمتك: استخراج الحقائق الدائمة فقط — اسم المستخدم، دوره، شركته، مشاريعه (اسم المشروع، نوعه، مدينته، مرحلته)، وتفضيلاته الثابتة — ودمجها مع الذاكرة الحالية في نص عربي موجز.\n` +
      `قواعد صارمة:\n` +
      `1) لا تُدخل أسئلة الكود العامة ولا محتوى تقنياً عابراً — الحقائق الدائمة فقط.\n` +
      `2) حدّث الحقيقة القديمة إذا غيّرها المستخدم، ولا تكرر.\n` +
      `3) الحد الأقصى 1200 حرف.\n` +
      `4) إن لم تكن في الرسالة أي حقيقة دائمة جديدة، أجب بكلمة واحدة فقط: NOCHANGE\n` +
      `5) أجب بنص الذاكرة الكامل المحدث فقط، بلا مقدمات ولا شروح.\n\n` +
      `الذاكرة الحالية:\n${existingMemory || "(فارغة)"}\n\n` +
      `رسالة المستخدم الجديدة:\n${msg.slice(0, 2000)}`;
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0 },
        }),
      },
    );
    if (!resp.ok) return;
    const j = await resp.json();
    const out = (j.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    if (!out || out === "NOCHANGE" || out.toUpperCase() === "NOCHANGE") return;
    const content = out.slice(0, USER_MEMORY_MAX_CHARS);
    await adminClient.from("user_memory").upsert({
      user_id: userId,
      content,
      updated_at: new Date().toISOString(),
    });
    console.log(`[Memory] updated for user ${userId} (${content.length} chars)`);
  } catch (e) {
    console.log(`[Memory] background update skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Schedule work to continue after the response is returned. */
function scheduleBackground(p: Promise<unknown>): void {
  const g = globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } };
  if (g.EdgeRuntime?.waitUntil) g.EdgeRuntime.waitUntil(p);
  else p.catch(() => {});
}

// ── D1 retrieval/embedding cache wiring (./retrievalCache.ts) ───────────────
// Everything below is inert unless RETRIEVAL_CACHE_ENABLED is exactly "1":
// retrievalCacheEnabled() is a single synchronous env read, and every call
// site below keeps the pre-existing expression as the else-branch, so with
// the flag off this file performs exactly the same awaits, the same network
// calls and the same logs as it did before the wiring.

/** The embedding model every query embedding in this file uses. Also the cache
 *  key component that keeps one model's vectors from being served for another
 *  (getEmbeddingCached folds it into the hash — see retrievalCache.ts). */
const QUERY_EMBEDDING_MODEL_ID = "gemini-embedding-001";

/** 24h, per docs/launch/retrieval-cache-notes.md. Governs both cache layers. */
const RETRIEVAL_CACHE_TTL_SECONDS = 60 * 60 * 24;

/**
 * Raised by an embedding compute() closure instead of resolving with a
 * sentinel. getEmbeddingCached stores only what compute() RESOLVES with, so
 * rejecting is what keeps a transient embedding failure (429, 5xx, an empty
 * body) out of BOTH cache layers — a cached failure would otherwise pin this
 * query to the keyword path for the whole 30-day embedding TTL. `reason`
 * carries the exact fallbackReason string the caller must report, so the
 * X-Retrieval-Fallback taxonomy ("embedding_http_<status>" /
 * "embedding_empty") is unchanged by the wrapping.
 */
class EmbeddingFailure extends Error {
  reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "EmbeddingFailure";
    this.reason = reason;
  }
}

/**
 * Fingerprint of the env flags that change what retrieval RETURNS for a fixed
 * query + corpus. Folded into the retrieval cache key's flags component
 * alongside runtime_settings.retrieval_flags_version.
 *
 * WHY BOTH: retrieval_flags_version is an owner-bumped number and is the
 * documented lever for "the pipeline's CODE changed" (retrieval-cache-notes.md).
 * It does NOT move on its own when وسيم flips an env flag on the deployed
 * function — and flipping ADVISORY_HYBRID_RETRIEVAL_ENABLED is exactly the
 * kind of change that must not serve rows computed under the old flag state.
 * Reading the flags directly closes that gap without requiring a manual step
 * to be remembered at the moment it matters most.
 */
function retrievalFlagFingerprint(): string {
  return [
    HYBRID_RETRIEVAL_FLAG_ENV,
    // The hybrid tuning knobs belong here for the same reason the flag does:
    // rows fused under one weight/quota must never be served for a request
    // running under another (added 2026-09-03 with the tuning itself).
    HYBRID_FTS_WEIGHT_ENV,
    HYBRID_VECTOR_QUOTA_RATIO_ENV,
    ADVISORY_GRAPH_FLAG_ENV,
    "ADVISORY_MULTI_QUERY_RETRIEVAL_ENABLED",
    "ADVISORY_BILINGUAL_EMBEDDING_ENABLED",
    "SBC_NEW_SOURCE_CODES_ENABLED",
    VECTOR_MIN_SIMILARITY_REL_ENV,
    VECTOR_MIN_SIMILARITY_ABS_ENV,
  ]
    .map((k) => `${k}=${Deno.env.get(k) ?? ""}`)
    .join("|");
}

let retrievalFlagsVersionMemo: { value: string; expiresAt: number } | null = null;

/**
 * runtime_settings.retrieval_flags_version, memoized for 5 minutes — the exact
 * shape getCorpusVersion uses in ./retrievalCache.ts, kept here rather than
 * added there because that module is owned by another item this wave. Fails
 * open to "1" on any error (table absent before the SQL is applied, network,
 * malformed row): a settings read must never be the reason retrieval fails,
 * and a wrong value can only cost a cache miss, never a wrong answer.
 */
async function getRetrievalFlagsVersion(client: RetrievalCacheClient): Promise<string> {
  const now = Date.now();
  if (retrievalFlagsVersionMemo && retrievalFlagsVersionMemo.expiresAt > now) {
    return retrievalFlagsVersionMemo.value;
  }
  try {
    const { data, error } = await client
      .from(RUNTIME_SETTINGS_TABLE)
      .select("value")
      .eq("key", "retrieval_flags_version")
      .maybeSingle();
    if (error) throw error;
    const value = String(data?.value ?? "1");
    retrievalFlagsVersionMemo = { value, expiresAt: now + 5 * 60 * 1000 };
    return value;
  } catch {
    return "1";
  }
}

/** Embed one piece of text with the same model/dimensionality the primary
 *  query uses. Returns null on any failure so a sub-topic can be skipped
 *  without disturbing the primary result set. */
async function embedQueryText(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { role: "user", parts: [{ text: text.substring(0, 8000) }] },
          outputDimensionality: 768,
        }),
      }
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j.embedding?.values ?? null;
  } catch {
    return null;
  }
}

function multiQueryRetrievalEnabled(): boolean {
  return (Deno.env.get("ADVISORY_MULTI_QUERY_RETRIEVAL_ENABLED") ?? "").trim() === "1";
}

function enabledNewSourceCodes(): string[] {
  const v = (Deno.env.get("SBC_NEW_SOURCE_CODES_ENABLED") ?? "").trim();
  if (v === "") return [];
  if (v === "1") return ["SBC401", "SBC501"];
  return v.split(",").map((s) => s.trim().toUpperCase())
    .filter((s) => s === "SBC401" || s === "SBC501");
}
function newSourceCodesEnabled(): boolean {
  return enabledNewSourceCodes().length > 0;
}

async function fetchSBCContext(query: string, extraKeywords?: string[]): Promise<{ context: string; files: string[]; sourceMeta: SourcePageMeta[] }> {
  const startTime = Date.now();
  const usedFiles: string[] = [];
  
  // Check query cache first
  const cacheKey = query.slice(0, 200).toLowerCase();
  const cached = queryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < QUERY_CACHE_TTL) {
    console.log(`⚡ Query cache hit! Returning cached result (${cached.result.context.length} chars)`);
    return cached.result;
  }
  
  console.log("=== SBC SMART RETRIEVAL START ===");

  try {
    // Key resolution lives INSIDE the try on purpose. getSecretKeyOrNull()
    // returns null when no key is configured (the tolerate-absence case the
    // guard below handles), but it THROWS when SUPABASE_SECRET_KEYS is present
    // and malformed -- a configuration error must not masquerade as absence.
    // Outside the try that throw would escape fetchSBCContext uncaught; inside,
    // the catch at the end of this function logs it and returns the same empty
    // result the guard returns, so retrieval degrades instead of 500-ing.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = getSecretKeyOrNull();

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("❌ Missing environment variables");
      return { context: "", files: [], sourceMeta: [] };
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    
    const { data: files, error: listError } = await supabaseAdmin.storage
      .from("ssss")
      .list("", { limit: 100 });
    
    if (listError || !files?.length) {
      console.error("❌ Error listing files:", listError?.message);
      return { context: "", files: [], sourceMeta: [] };
    }
    
    console.log(`📁 Found ${files.length} total files`);
    
    // Get target chapters from query
    let { sbc201Chapters, sbc801Chapters } = getTargetChapters(query);

    // Secondary pass: if chapters are still empty, run chapter detection on the
    // English-translated keywords (covers Arabic keyword queries where the in-function
    // Unicode string comparison may not match due to runtime encoding).
    if (sbc201Chapters.length === 0 && sbc801Chapters.length === 0) {
      const translatedKeywords = buildQueryKeywords(query);
      const sbc201Set = new Set<number>();
      const sbc801Set = new Set<number>();
      for (const kw of translatedKeywords) {
        const ch = (CHAPTER_KEYWORDS as Record<string, { sbc201: number[]; sbc801: number[] }>)[kw];
        if (ch) {
          ch.sbc201.forEach(c => sbc201Set.add(c));
          ch.sbc801.forEach(c => sbc801Set.add(c));
        }
      }
      // Cross-reference
      if (sbc201Set.has(9) || sbc201Set.has(10)) { sbc801Set.add(6); sbc801Set.add(7); }
      if (sbc801Set.has(6) || sbc801Set.has(7)) { sbc201Set.add(9); sbc201Set.add(10); }
      sbc201Chapters = [...sbc201Set];
      sbc801Chapters = [...sbc801Set];
      if (sbc201Chapters.length > 0) console.log("🔄 Secondary keyword-based chapter detection used");
    }

    console.log(`🎯 Target chapters - SBC 201: [${sbc201Chapters.join(",")}], SBC 801: [${sbc801Chapters.join(",")}]`);

    // Get target page ranges
    const sbc201Ranges = selectTargetPageRanges(sbc201Chapters, SBC201_INDEX);
    const sbc801Ranges = selectTargetPageRanges(sbc801Chapters, SBC801_INDEX);
    console.log(`📄 Target ranges - SBC 201: [${sbc201Ranges.join(",")}], SBC 801: [${sbc801Ranges.join(",")}]`);

    // New-code targeting (flag-gated; both lists stay empty while OFF).
    // Unlike 201/801, the new codes are included ONLY on a positive keyword
    // hit: selectTargetPageRanges' first-two-volumes fallback would otherwise
    // spend context budget on electrical/mechanical volumes for every
    // unrelated query. Empty ranges make scoreFile() return 0 for every
    // new-code file, so they cannot enter the selection below.
    let sbc401Ranges: string[] = [];
    let sbc501Ranges: string[] = [];
    if (newSourceCodesEnabled()) {
      const enabledCodes = enabledNewSourceCodes();
      const nc = getNewCodeChapters(query.toLowerCase(), buildQueryKeywords(query));
      if (enabledCodes.includes("SBC401") && nc.sbc401Chapters.length > 0) {
        sbc401Ranges = selectTargetPageRanges(nc.sbc401Chapters, SBC401_INDEX);
      }
      if (enabledCodes.includes("SBC501") && nc.sbc501Chapters.length > 0) {
        sbc501Ranges = selectTargetPageRanges(nc.sbc501Chapters, SBC501_INDEX);
      }
      if (sbc401Ranges.length > 0 || sbc501Ranges.length > 0) {
        console.log(`📄 New-code target ranges - SBC 401: [${sbc401Ranges.join(",")}], SBC 501: [${sbc501Ranges.join(",")}]`);
      }
    }
    
    // Filter candidate files
    let chunkFiles = files.filter((f: any) => 
      f.name.endsWith(".json") && 
      f.name.toLowerCase().includes("chunk")
    );
    
    let extractedFiles = files.filter((f: any) => 
      f.name.endsWith(".json") && 
      !f.name.toLowerCase().includes("chunk")
    );
    
    let candidateFiles = chunkFiles.length > 0 ? chunkFiles : extractedFiles;
    
    if (candidateFiles.length === 0) {
      candidateFiles = files.filter((f: any) => f.name.endsWith(".json"));
    }
    
    if (candidateFiles.length === 0) {
      return { context: "", files: [], sourceMeta: [] };
    }
    
    // Smart file selection based on page ranges
    const sbc201Files = candidateFiles.filter((f: any) => {
      const nameLower = f.name.toLowerCase();
      return nameLower.includes("201") || nameLower.includes("building");
    });
    const sbc801Files = candidateFiles.filter((f: any) => {
      const nameLower = f.name.toLowerCase();
      return nameLower.includes("801") || nameLower.includes("fire");
    });

    // New-code files, ANCHORED at the name start (never bare includes() —
    // that is the documented "1201 contains 201" leak class). Empty while the
    // flag is off or no such blobs exist in the bucket, in which case nothing
    // downstream changes.
    const sbc401Files = enabledNewSourceCodes().includes("SBC401")
      ? candidateFiles.filter((f: any) => /^sbc[ _-]?401/.test(f.name.toLowerCase()))
      : [];
    const sbc501Files = enabledNewSourceCodes().includes("SBC501")
      ? candidateFiles.filter((f: any) => /^sbc[ _-]?501/.test(f.name.toLowerCase()))
      : [];
    
    // Score files by matching page ranges in filenames
    function scoreFile(file: any, targetRanges: string[]): number {
      const name = file.name.toLowerCase();
      let bestScore = 0;
      for (const range of targetRanges) {
        const [start, end] = range.split("-").map(Number);
        // Check if filename contains page numbers in this range
        const pageMatch = name.match(/(\d+)\s*-\s*(\d+)/);
        if (pageMatch) {
          const fStart = parseInt(pageMatch[1]);
          const fEnd = parseInt(pageMatch[2]);
          // Overlap check
          if (fStart <= end && fEnd >= start) {
            const overlap = Math.min(fEnd, end) - Math.max(fStart, start);
            bestScore = Math.max(bestScore, overlap);
          }
        } else {
          // No page range in name, give default score
          bestScore = Math.max(bestScore, 1);
        }
      }
      return bestScore;
    }
    
    // Sort and select files with smart targeting
    const scored201 = sbc201Files.map(f => ({ file: f, score: scoreFile(f, sbc201Ranges) }))
      .sort((a, b) => b.score - a.score);
    const scored801 = sbc801Files.map(f => ({ file: f, score: scoreFile(f, sbc801Ranges) }))
      .sort((a, b) => b.score - a.score);
    
    // Select top files: when chapters are targeted, prefer only the scored files
    // (score > 0 = overlaps target ranges). Zero-score files dilute the context budget.
    const targeted201 = scored201.filter(s => s.score > 0);
    const targeted801 = scored801.filter(s => s.score > 0);
    const max201 = targeted201.length > 0
      ? Math.min(targeted201.length, 4)  // only use files that actually cover the target chapters
      : Math.min(scored201.length, 3);   // fallback: first 3
    const max801 = targeted801.length > 0
      ? Math.min(targeted801.length, 4)
      : Math.min(scored801.length, 3);

    // New-code files enter ONLY with a positive range overlap (score > 0):
    // no fallback slots, at most 2 volumes per code, appended AFTER the
    // legacy selection so the 12-file cap always prefers 201/801.
    const targeted401 = sbc401Files
      .map((f: any) => ({ file: f, score: scoreFile(f, sbc401Ranges) }))
      .filter((s: any) => s.score > 0)
      .sort((a: any, b: any) => b.score - a.score);
    const targeted501 = sbc501Files
      .map((f: any) => ({ file: f, score: scoreFile(f, sbc501Ranges) }))
      .filter((s: any) => s.score > 0)
      .sort((a: any, b: any) => b.score - a.score);

    let selectedFiles = [
      ...scored201.slice(0, max201).map(s => s.file),
      ...scored801.slice(0, max801).map(s => s.file),
      ...targeted401.slice(0, 2).map((s: any) => s.file),
      ...targeted501.slice(0, 2).map((s: any) => s.file),
    ];
    
    // Ensure at least some files. New-code blobs are excluded from this
    // filler UNCONDITIONALLY (not just while the flag is off): an ungated
    // code must never be served as generic padding — it enters only through
    // its own targeted selection above, behind the flag and its gate.
    if (selectedFiles.length < 3) {
      const remaining = candidateFiles.filter(f =>
        !selectedFiles.includes(f) && !/^sbc[ _-]?[45]01/.test(f.name.toLowerCase()));
      selectedFiles = [...selectedFiles, ...remaining.slice(0, 5 - selectedFiles.length)];
    }

    // Cap at 12 files max (increased from 7 for better coverage)
    selectedFiles = selectedFiles.slice(0, 12);
    
    console.log(`🎯 Selected ${selectedFiles.length} files: ${selectedFiles.map((f: any) => f.name).join(", ")}`);
    
    const MAX_TOTAL_CONTEXT = 120000; // Increased for better RAG coverage (Gemini supports 1M tokens)
    let keywords = buildQueryKeywords(query);
    
    if (extraKeywords && extraKeywords.length > 0) {
      keywords = [...new Set([...keywords, ...extraKeywords])];
    }

    // Build structured query metadata for precision scoring
    const queryMeta = buildQueryMeta(query);

    // ── D3: in-database keyword retrieval (SBC_KEYWORD_FTS_ENABLED) ─────────
    // Everything below this block — bucket listing, file scoring, up to 12
    // downloads, in-isolate parsing and scoring — computes what one indexed
    // query over sbc_documents.tsv already answers (measured 33ms against the
    // live corpus, versus 0.6-3.8s for the storage path). Flag OFF is the
    // storage path, byte-identical: isKeywordFtsEnabled is a single
    // synchronous env read and this block is skipped entirely.
    //
    // The RPC gets the SAME terms the TypeScript scorer would have used
    // (keywords plus the structured metadata's section numbers, table refs
    // and exact phrases), because the corpus is English and the raw Arabic
    // question matches nothing lexically. Fail-open: null means "keep going
    // down the storage path", so a missing RPC or a bad query costs latency,
    // never the answer.
    if (isKeywordFtsEnabled(Deno.env.get)) {
      const ftsTerms = [
        ...keywords,
        ...queryMeta.sectionNumbers,
        ...queryMeta.tableRefs,
        ...queryMeta.exactPhrases,
      ];
      const ftsStart = Date.now();
      const fts = await fetchSBCContextKeywordFts(ftsTerms, null, 40, supabaseAdmin, MAX_TOTAL_CONTEXT);
      if (fts) {
        console.log(
          `[Keyword FTS] ${fts.docIds.length} chunks from ${fts.files.length} files in ${Date.now() - ftsStart}ms ` +
          `(${fts.context.length} chars, ${ftsTerms.length} terms) — storage path skipped`,
        );
        const result = { context: fts.context, files: fts.files, sourceMeta: fts.sourceMeta };
        queryCache.set(cacheKey, { result, timestamp: Date.now() });
        cleanupQueryCache();
        return result;
      }
      console.log("[Keyword FTS] no usable result — falling through to the storage path");
    }

    // Download files in parallel
    const downloadPromises = selectedFiles.map(async (file: any) => {
      try {
        const cachedFile = fileCache.get(file.name);
        if (cachedFile && Date.now() - cachedFile.timestamp < CACHE_TTL) {
          console.log(`⚡ Cache hit: ${file.name}`);
          usedFiles.push(file.name);
          return { fileName: file.name, raw: cachedFile.content };
        }
        
        console.log(`⬇️ Downloading: ${file.name}`);
        const { data, error } = await supabaseAdmin.storage
          .from("ssss")
          .download(file.name);
        
        if (error || !data) {
          console.error(`❌ Download failed: ${file.name}`, error?.message);
          return null;
        }
        
        const text = await data.text();
        fileCache.set(file.name, { content: text, timestamp: Date.now() });
        cleanupCache();
        usedFiles.push(file.name);
        
        return { fileName: file.name, raw: text };
      } catch (err) {
        console.error(`❌ Exception: ${file.name}`, err);
        return null;
      }
    });
    
    const downloadResults = await Promise.all(downloadPromises);
    const validDownloads = downloadResults.filter(Boolean) as { fileName: string; raw: string }[];

    // Extract and score chunks - only keeps scored > 0
    let allScoredChunks: ScoredChunk[] = [];
    for (const dl of validDownloads) {
      const chunks = extractAndScoreChunks(dl.raw, dl.fileName, keywords, queryMeta);
      allScoredChunks.push(...chunks);
    }
    
    console.log(`🧩 ${allScoredChunks.length} relevant chunks from ${validDownloads.length} files (zero-score filtered out)`);
    
    // Sort by score descending
    allScoredChunks.sort((a, b) => b.score - a.score);
    
    // Select top chunks with early termination
    let totalChars = 0;
    const selectedChunks: ScoredChunk[] = [];
    for (const chunk of allScoredChunks) {
      if (totalChars + chunk.text.length > MAX_TOTAL_CONTEXT) {
        if (chunk.score > 0) {
          const remaining = MAX_TOTAL_CONTEXT - totalChars;
          if (remaining > 500) {
            selectedChunks.push({ ...chunk, text: chunk.text.slice(0, remaining) + "\n...[truncated]" });
            totalChars += remaining;
          }
        }
        break;
      }
      selectedChunks.push(chunk);
      totalChars += chunk.text.length;
    }
    
    const sourcesUsed = [...new Set(selectedChunks.map(c => c.source))];
    console.log(`📋 Selected ${selectedChunks.length} chunks, ${totalChars} chars from ${sourcesUsed.join(", ")} in ${Date.now() - startTime}ms`);
    
    // Fallback to extracted files if chunks failed
    if (selectedChunks.length === 0 && chunkFiles.length > 0 && extractedFiles.length > 0) {
      console.log("⚠️ Chunk files failed, trying extracted files as fallback...");
      const fallbackFiles = extractedFiles.slice(0, 4);
      
      const fallbackPromises = fallbackFiles.map(async (file: any) => {
        try {
          const { data, error } = await supabaseAdmin.storage.from("ssss").download(file.name);
          if (error || !data) return null;
          const text = await data.text();
          const truncated = text.length > 30000 ? text.slice(0, 30000) + "\n...[truncated]" : text;
          usedFiles.push(file.name);
          return `\n=== ${file.name} ===\n${truncated}`;
        } catch {
          return null;
        }
      });
      
      const fallbackResults = await Promise.all(fallbackPromises);
      const validFallback = fallbackResults.filter(Boolean);
      
      if (validFallback.length > 0) {
        const context = `\n\n📚 SBC REFERENCE DOCUMENTS (USE THESE AS PRIMARY SOURCE):\n${validFallback.join("\n")}`;
        const result = { context, files: usedFiles, sourceMeta: [] as SourcePageMeta[] };
        queryCache.set(cacheKey, { result, timestamp: Date.now() });
        cleanupQueryCache();
        return result;
      }
    }

    if (selectedChunks.length > 0) {
      const bySource = new Map<string, string[]>();
      for (const c of selectedChunks) {
        if (!bySource.has(c.source)) bySource.set(c.source, []);
        bySource.get(c.source)!.push(c.text);
      }

      let contextStr = "\n\n📚 SBC REFERENCE DOCUMENTS (MOST RELEVANT SECTIONS SELECTED):\n";
      for (const [source, texts] of bySource) {
        contextStr += `\n=== ${source} (${texts.length} relevant sections) ===\n${texts.join("\n---\n")}`;
      }

      // Build per-file page metadata from selected chunks
      const sourceMetaMap = new Map<string, { minPage: number | null; maxPage: number | null }>();
      for (const c of selectedChunks) {
        const m = sourceMetaMap.get(c.source) ?? { minPage: null, maxPage: null };
        if (c.pageStart != null) m.minPage = m.minPage == null ? c.pageStart : Math.min(m.minPage, c.pageStart);
        if (c.pageEnd != null) m.maxPage = m.maxPage == null ? c.pageEnd : Math.max(m.maxPage, c.pageEnd);
        sourceMetaMap.set(c.source, m);
      }
      const sourceMeta: SourcePageMeta[] = [...sourcesUsed].map(file => {
        const m = sourceMetaMap.get(file);
        const hasPages = m && (m.minPage != null || m.maxPage != null);
        return {
          file,
          pageStart: m?.minPage ?? null,
          pageEnd: m?.maxPage ?? null,
          precision: hasPages ? 'page_range' : 'chunk_range_only',
        };
      });

      const result = { context: contextStr, files: [...sourcesUsed], sourceMeta };
      queryCache.set(cacheKey, { result, timestamp: Date.now() });
      cleanupQueryCache();
      return result;
    }

    return { context: "", files: [], sourceMeta: [] };
  } catch (error) {
    console.error("❌ Critical error in fetchSBCContext:", error);
    return { context: "", files: [], sourceMeta: [] };
  }
}

// ==================== STRUCTURED TABLE LOOKUP (DB-backed transcription layer) ====================
//
// When a user query explicitly references a known SBC table ID (e.g. "Table 1004.5",
// "جدول 504.3", "Table 1006.3.3") this path surfaces the matching row from
// sbc_code_tables, because storage-file chunk scoring can truncate or miss table data.
//
// PROVENANCE WARNING — read before changing anything here. These rows are a
// hand-entered transcription layer, NOT an extraction from the SBC documents, and
// they are NOT verified. Audit 2026-08-23 (docs/audits/SAFETY-ALERT-code-tables-
// 20260823.md) found 5 of 7 deeply-checked tables wrong, some with the requirement
// inverted, and 57 of 93 rows carrying imperial units although SBC is metric.
//
// The lookup runs BEFORE keyword retrieval and its result is prepended to the system
// prompt context, so the model sees it first. That ordering is NOT a statement of
// trust: the injected block (see buildStructuredTableBlock in ./promptContract.ts)
// tells the model these rows are unverified, must not be quoted as code text, and are
// overridden by retrieved SBC document text on any conflict.

/** Extract table IDs referenced in a query, e.g. "Table 504.3" → ["504.3"] */
function extractTableIds(query: string): string[] {
  const lower = query.toLowerCase();
  const found = new Set<string>();

  // Match "table 504.3", "table 1006.3.3", "جدول 1004.5", etc.
  const tblRegex = /(?:table|جدول)\s+(\d{3,4}(?:\.\d{1,2}){0,2})/gi;
  let m: RegExpExecArray | null;
  while ((m = tblRegex.exec(lower)) !== null) {
    found.add(m[1]);
  }

  // Also match bare section numbers when they look like table IDs that we know about.
  //
  // MEASURED against production on 2026-08-23 (SELECT only): public.sbc_code_tables
  // holds 93 rows - 42 carry a "QUARANTINED_" prefix on table_id and 51 are active.
  // table_id is NOT unique: "417" appears on two rows. Collapsing the prefix gives
  // 91 distinct BASE ids, which is exactly the list below.
  //
  // WHY THE LIST CARRIES QUARANTINED IDS TOO: fetchStructuredTables() looks rows up
  // with .in("table_id", ids) - an exact match on the raw column. A quarantined row
  // is stored as "QUARANTINED_903.2", so the base id "903.2" simply matches nothing
  // and no table is injected. Listing the base id is therefore a no-op while the row
  // is quarantined, and becomes correct the moment the owner applies the restoration
  // SQL that strips the prefix. Listing only the 51 currently-active ids would
  // silently break every restored table on the day that SQL lands.
  //
  // Ordered by source code and chapter; per-group counts are stated so drift shows.
  const KNOWN_TABLE_IDS = [
    // SBC 201 Chapter 3 - Use and Occupancy Classification (11)
    "302", "303", "304", "305", "306", "307", "308", "309", "310", "311", "312",
    // SBC 201 Chapter 4 - Special Detailed Requirements Based on Occupancy (17)
    "402", "403.1", "404", "405", "406.5", "406.6", "407", "408",
    "412", "412.2", "412.5", "413", "414", "415", "416", "417", "420",
    // SBC 201 Chapter 5 - General Building Heights and Areas (8 + 1 rebuilt)
    "504.3", "504.4", "506.2", "508", "508.3", "508.4", "508.5", "509",
    "509.1",      // POST-REBUILD id: B1 renumbers 509 -> 509.1
    // SBC 201 Chapter 6 - Types of Construction (2)
    "601", "602",
    // SBC 201 Chapter 7 - Fire and Smoke Protection Features (1 + 1 rebuilt)
    "705.8",
    "705.5",      // POST-REBUILD id: B1 renumbers 602 -> 705.5
    // SBC 201 Chapter 10 - Means of Egress (30 + 2 rebuilt)
    "1004.5", "1005.1", "1006.2.1", "1006.3.3", "1006.3.4", "1006.3.4(2)",
    "1006.3.4(1)", // POST-REBUILD id: B1 renumbers 1006.3.4 -> 1006.3.4(1).
                   // Without this entry the row is UNREACHABLE by either stage:
                   // the tblRegex above captures "1006.3.4" and stops at the
                   // parenthesis, so it never produces the stored id.
    "1008", "1009", "1010", "1011.2", "1012", "1013",
    "1014", "1014.1", "1014.2", "1014.3", "1014.4", "1014.5", "1014.6",
    "1015", "1017.2", "1018.1", "1019", "1020.1", "1021.2", "1022", "1023",
    "1024", "1029.6.3", "1030",
    "1020.2",     // POST-REBUILD id: B1 renumbers 1020.1 -> 1020.2
    //
    // ADDED 2026-08-23 (B4). The four ids marked POST-REBUILD exist only after
    // docs/audits/code-tables-rebuild-20260823.sql is applied. Listing them
    // early is a no-op until then (fetchStructuredTables does an exact
    // .in("table_id", ids) match, so an id with no row injects nothing) — the
    // same reasoning that already justifies listing quarantined base ids above.
    // SEQUENCING: ship this code BEFORE the SQL. Code-first is harmless; SQL-
    // first leaves 1006.3.4(1) dark and 1020.2 / 705.5 / 509.1 reachable only
    // when the user literally types the word "Table".
    //
    // DELIBERATELY NOT LISTED: "1020.2-width". B1 chose that synthetic id so the
    // corridor-width row stays UN-injected until the owner rules on renumbering
    // it to 1020.3 (SBC 801 p.839 prints corridor width as TABLE 1020.3, while
    // SBC 201 prints two different tables both numbered 1020.2). Adding it here
    // would defeat that hold. Do not "fix" this — src/__tests__/retrievalPolicy
    // .test.ts asserts it stays unmatchable and will fail if it is added.
    //
    // The five pre-rebuild ids the SQL renumbers away from — "509", "602",
    // "1006.3.4", "1018.1", "1020.1" — are left in place on purpose: the SQL is
    // not applied yet, and after it is applied they simply match no row.
    // SBC 801 Chapter 9 - Fire Protection and Life Safety Systems (22)
    "903.2", "903.2.7", "903.3.1", "903.3.2", "903.4", "903.4.3", "904",
    "905.3.1", "907.2", "907.2.7", "907.3", "907.4.2", "907.5", "907.6",
    "909", "910", "911", "912", "913", "914", "915", "916",
  ];
  for (const id of KNOWN_TABLE_IDS) {
    // Match "1004.5" appearing as a standalone reference with word boundaries.
    // Escape ALL regex metacharacters, not just ".", because the measured id list
    // now contains "1006.3.4(2)" — unescaped parentheses would compile to a capture
    // group and match the wrong text. The word-boundary assertion is applied only on
    // a side that actually ends in a word character: "\b" after ")" can never match.
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const lead = /^\w/.test(id) ? "\\b" : "";
    const tail = /\w$/.test(id) ? "\\b" : "";
    if (new RegExp(`${lead}${escaped}${tail}`).test(lower)) {
      found.add(id);
    }
  }

  // Parent-section aliases — when user asks about a whole section/chapter
  // without specifying a sub-table, inject the most-relevant known table(s).
  const PARENT_ALIASES: Record<string, string[]> = {
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
    // "1006"/"1020" repointed 2026-08-23 (B4) at B1's post-rebuild ids. Both
    // pre-rebuild ids are kept alongside so the alias works whether or not
    // docs/audits/code-tables-rebuild-20260823.sql has been applied yet.
    "1006":   ["1006.2.1", "1006.3.3", "1006.3.4", "1006.3.4(1)", "1006.3.4(2)"],
    "1011":   ["1011.2"],
    "1017":   ["1017.2"],
    // "1018" is INTENTIONALLY DORMANT — do not repoint it.
    // Its only table was 1018.1 (corridor width). That row is quarantined today
    // and B1's rebuild renames it to the synthetic id "1020.2-width", which is
    // deliberately unmatchable until the owner rules on renumbering it to
    // 1020.3. Pointing this alias at either id would look correct and inject
    // nothing: "1018.1" matches no row after the rebuild, and "1020.2-width" is
    // excluded from KNOWN_TABLE_IDS on purpose. The key is kept rather than
    // deleted so the reason survives; an empty list is behaviourally identical
    // to absence. src/__tests__/retrievalPolicy.test.ts asserts it stays empty.
    "1018":   [],
    "1020":   ["1020.1", "1020.2"],
    "1021":   ["1021.2"],
    "1029":   ["1029.6.3"],
    // SBC 801 Ch. 9 parents
    "903":    ["903.2", "903.3.1", "903.3.2"],
    "903.4":  ["903.4", "903.4.3"],
    "905":    ["905.3.1"],
    "907":    ["907.2", "907.3"],
    "907.4":  ["907.4.2"],
  };
  for (const [parent, children] of Object.entries(PARENT_ALIASES)) {
    const esc = parent.replace(/\./g, "\\.");
    // Always expand all children when parent matches — Set handles deduplication
    if (new RegExp(`\\b${esc}\\b`).test(lower)) {
      for (const c of children) found.add(c);
    }
  }

  // Semantic aliases — common query phrases that map to specific tables.
  // Regex design rules:
  //   1. No outer \b wrappers — Arabic Unicode chars break \b; patterns are specific enough
  //   2. Use \b only at English pattern starts where helpful
  //   3. Use \w* to absorb word suffixes where trailing \b would fail on prefixes (e.g. "occupancy")
  //   4. Handle Arabic definite article ال with (?:ال)? where nouns may be prefixed
  const SEMANTIC_ALIASES: Array<[RegExp, string[]]> = [
    // ── CHAPTER 3 — Occupancy Classification ─────────────────────────────────
    [/occupancy\s+classif|تصنيف\s+الإشغال|كيف\s+أصنف|أي\s+إشغال/i,                    ["302"]],
    [/what\s+(?:group|occupancy)\s+is|ما\s+(?:تصنيف|مجموعة)\s+إشغال/i,                 ["302"]],
    // Assembly — covers "assembly occupancy", "A-2 assembly", restaurant/café
    [/assembly\s+(?:occup\w*|group\w*|A-[1-5])|A-[1-5]\s+(?:occup\w*|assembly)|\brestaurant\b|\bcafé?\b|مجموعة\s+(?:التجمع|أ)|مبنى\s+تجمع|مطعم/i, ["303"]],
    // Business — offices, Group B
    [/business\s+occup\w*|\bGroup\s+B\b|open.plan\s+office|office\s+(?:building|floor|space|occup\w*)|مكاتب\s+(?:إدارية|تجارية)|مجموعة\s+ب\b/i, ["304"]],
    // Educational — schools, Group E
    [/educational\s+occup\w*|\bGroup\s+E\b|school\s+(?:occup\w*|build\w*)|مبنى\s+(?:تعليمي|مدرسي)|مجموعة\s+(?:التعليم|هـ)\b|مدارس/i, ["305"]],
    // Factory — Group F
    [/factory\s+occup\w*|\bGroup\s+F[12]?\b|F-[12]\s+(?:hazard|occup\w*)|مصنع\s+إشغال\w*|مجموعة\s+F\b/i, ["306"]],
    // High-hazard — Group H
    [/high.hazard\s+occup\w*|\bGroup\s+H[1-5]?\b|H-[1-5]\s+(?:class|occup\w*)|مخزن\s+خطر|مجموعة\s+H\b/i, ["307", "415"]],
    // Institutional — Group I, I-2
    [/institutional\s+occup\w*|\bGroup\s+I[1-4]?\b|I-[1-4]\s+(?:class|occup\w*|group)|مستشفى\s+إشغال|مجموعة\s+I\b/i, ["308"]],
    // Mercantile — retail, Group M
    [/mercantile\s+occup\w*|\bGroup\s+M\b|retail\s+(?:shop\w*|store\w*|occup\w*|space\w*)|محلات\s+تجارية|مجموعة\s+(?:M|التجزئة)\b/i, ["309"]],
    // Residential — Group R, مبنى سكني
    [/residential\s+occup\w*|\bGroup\s+R[1-4]?\b|R-[1-4]\s+(?:class|occup\w*)|سكني\s+إشغال|مبنى\s+سكني|مجموعة\s+(?:R|السكني)\b/i, ["310"]],
    // Storage — Group S
    [/storage\s+occup\w*|\bGroup\s+S[12]?\b|S-[12]\s+(?:class|occup\w*)|مستودع\s+إشغال|مجموعة\s+(?:S|التخزين)\b/i, ["311"]],
    // Utility — Group U
    [/utility\s+occup\w*|\bGroup\s+U\b|miscellaneous\s+occup\w*|مجموعة\s+(?:U|المرافق)\b/i, ["312"]],

    // ── CHAPTER 4 — Special Use / Detailed Requirements ───────────────────────
    [/covered\s+mall|open\s+mall|mall\s+building|مول\s+تجاري|مبنى\s+مول/i,             ["402"]],
    // High-rise buildings
    [/high.rise|high\s+rise|مبنى\s+شاهق|المباني\s+الشاهقة|شاهق|55\s*(?:ft|feet|قدم)/i, ["403.1"]],
    [/fire\s+command\s+center|مركز\s+قيادة\s+الحرائق|emergency\s+power\s+(?:high|building)/i, ["403.1"]],
    [/atrium|أتريوم|فناء\s+داخلي|بهو\s+(?:متعدد|مفتوح)/i,                              ["404"]],
    [/underground\s+(?:building|structure|level)|below.grade\s+(?:floor|level)|subterranean|تحت\s+الأرض|طابق\s+سفلي/i, ["405"]],
    // Parking
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
    // Both ids listed: B1's rebuild renumbers 602 -> 705.5. Keeping both makes
    // the alias correct before AND after docs/audits/code-tables-rebuild-
    // 20260823.sql is applied; the id that has no row simply matches nothing.
    [/exterior\s+wall\s+(?:rating|fire)|fire\s+separation\s+distance|بُعد\s+الفصل/i,    ["602", "705.5"]],

    // ── CHAPTER 7 — Exterior Wall Openings ───────────────────────────────────
    [/exterior\s+wall\s+opening\w*|window\s+(?:area|limit)|فتحات\s+الجدار/i,             ["705.8"]],

    // ── CHAPTER 10 — Means of Egress ─────────────────────────────────────────
    [/occupant\s+load|floor\s+area\s+per\s+occup\w*|حمل\s+الإشغال|عدد\s+الأشخاص\s+لكل/i, ["1004.5"]],
    [/egress\s+width|exit\s+width|stairway?\s+width\s+per|عرض\s+(?:المخرج|السلم)\s+لكل/i, ["1005.1"]],
    [/width\s+per\s+occup\w*|inches?\s+per\s+occup\w*|بوصة?\s+لكل\s+شخص/i,              ["1005.1"]],
    // 1006.3.4 -> 1006.3.4(1) after B1's rebuild; both listed for the same
    // before/after reason as 602 -> 705.5 above.
    [/one\s+exit\s+(?:space|room|story)|single\s+exit|مخرج\s+واحد|جواز\s+مخرج\s+واحد/i, ["1006.2.1", "1006.3.3", "1006.3.4", "1006.3.4(1)", "1006.3.4(2)"]],
    // Emergency lighting — handle Arabic definite article ال
    [/emergency\s+lighting|emergency\s+illumin\w*|إضاءة\s+(?:ال)?(?:طوارئ|اضطرارية)|إنارة\s+(?:ال)?طوارئ/i, ["1008"]],
    [/egress\s+illumin\w*|means\s+of\s+egress\s+lighting|إضاءة\s+مسار\s+الهروب/i,       ["1008"]],
    [/accessible\s+(?:egress|means\s+of\s+egress)|area\s+of\s+refuge|مناطق\s+الملاذ|ملاذ\s+(?:آمن|حريق)|إخلاء\s+ذوي/i, ["1009"]],
    [/egress\s+door\w*|door\s+(?:hardware|latch|lock|panic|release)|panic\s+hardware|باب\s+المخرج|أبواب\s+(?:الطوارئ|الخروج)\s+(?:متطلبات|أجهزة)/i, ["1010"]],
    [/riser\s+height|tread\s+depth|stair\s+dimen\w*|headroom|ارتفاع\s+الدرجة|عمق\s+الدرجة/i, ["1011.2"]],
    [/stairway?\s+(?:min\w*|width|size)|أبعاد\s+(?:الدرج|السلم)/i,                       ["1011.2"]],
    [/handrail\s+(?:height|grip|require\w*|dimen\w*)|درابزين\s+(?:اليد|الحماية|ارتفاع|أبعاد)/i, ["1012"]],
    [/exit\s+sign\s+(?:require\w*|illumin\w*|location)|where\s+(?:are?\s+)?exit\s+signs?|لافتة\s+(?:المخرج|الخروج)|إشارات\s+المخرج/i, ["1013"]],
    [/guardrail?\s+(?:height|require\w*)|open\s+side\s+(?:stair|ramp|floor)|درابزين\s+الحماية/i, ["1015"]],
    // Travel distance
    [/travel\s+distance|مسافة\s+(?:السفر|الهروب|سفر)/i,                                 ["1017.2"]],
    [/max(?:imum)?\s+travel|أقصى\s+مسافة/i,                                             ["1017.2"]],
    // Corridor width — INTENTIONALLY DORMANT, do not repoint.
    // "1018.1" is quarantined today (so this injects nothing already), and B1's
    // rebuild renames that row to the synthetic id "1020.2-width", which is
    // deliberately excluded from KNOWN_TABLE_IDS until the owner rules on
    // renumbering it to 1020.3. Adding "1020.2-width" here would defeat that
    // hold. Same reasoning as the "1018" PARENT_ALIASES entry above.
    // Note the stakes: docs/audits/SAFETY-ALERT-code-tables-20260823.md measured
    // the stored 1018.1 row at 914 mm where SBC requires 1100 mm — a 19%
    // under-specification of egress corridor width. Dormant is the safe state.
    [/min(?:imum)?\s+corridor\s+width|how\s+wide.*corridor|corridor.*how\s+wide|corridor.*width|width.*corridor|عرض\s+(?:ال)?ممر/i, ["1018.1"]],
    // Corridor fire rating — 1020.1 -> 1020.2 after B1's rebuild; both listed.
    [/corridor\s+(?:rating|fire|مقاومة)|ممر\s+مقاوم|unrated.*corridor|corridor.*unrat\w*/i, ["1020.1", "1020.2"]],
    // Number of exits — handle Arabic ال prefix
    [/number\s+of\s+exits?|(?:عدد|كم)\s+(?:ال)?(?:مخارج|مخرج)|كم\s+عدد\s+(?:ال)?(?:مخارج|مخرج)/i, ["1021.2"]],
    [/min(?:imum)?\s+exits?|الحد\s+الأدنى\s+للمخارج/i,                                  ["1021.2"]],
    [/luminous\s+(?:egress|marking\w*|path)|photoluminescent|مسار\s+مضيء|علامات\s+مضيئة/i, ["1024"]],
    [/assembly\s+aisle\s+(?:width|access\w*)|aisle\s+accessway\s+(?:width|min\w*)|ممر\s+التجمع|عرض\s+الممر\s+المتقاطع/i, ["1029.6.3"]],
    [/emergency\s+escape\s+(?:opening|window)|rescue\s+opening|نافذة\s+الإنقاذ|فتحة\s+الطوارئ/i, ["1030"]],

    // ── CHAPTER 5 — Incidental Uses ──────────────────────────────────────────
    // 509 -> 509.1 after B1's rebuild; both listed for the same before/after
    // reason as 602 -> 705.5 above.
    [/generator\s+room|boiler\s+room|incidental\s+use|fuel.fired\s+room|غرفة\s+(?:المولد|المرجل)/i, ["509", "509.1"]],
    [/electrical\s+room\s+(?:separation|fire|rating)|storage\s+room\s+(?:separation|fire)|laundry\s+room\s+(?:separation|fire)/i, ["509", "509.1"]],
    [/الاستخدامات\s+العرضية|غرفة\s+التخزين\s+(?:فصل|حريق)/i,                             ["509", "509.1"]],

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
  ];
  for (const [pattern, tableIds] of SEMANTIC_ALIASES) {
    if (pattern.test(query)) {
      for (const id of tableIds) found.add(id);
    }
  }

  // Legacy table IDs → map to their 2024 replacements and add both
  const LEGACY_MAP: Record<string, string[]> = {
    "503":       ["504.3", "504.4", "506.2"],
    "1004.1.2":  ["1004.5"],
    "1004.1":    ["1004.5"],
  };
  for (const [legacy, replacements] of Object.entries(LEGACY_MAP)) {
    const escaped = legacy.replace(/\./g, "\\.");
    if (new RegExp(`(?:table|جدول)\\s+${escaped}\\b`, "i").test(query) ||
        new RegExp(`\\b${escaped}\\b`).test(lower)) {
      found.add(legacy); // keep original for note
      for (const r of replacements) found.add(r);
    }
  }

  return [...found];
}

/**
 * Fetch structured table rows from sbc_code_tables for any table IDs found in the query.
 * Returns a context block ready to be prepended to the system prompt, plus the list of
 * table IDs that were matched and returned.
 */
// deno-lint-ignore no-explicit-any
async function fetchStructuredTables(
  query: string,
  supabaseAdmin: any,
): Promise<{ context: string; matchedTableIds: string[]; matchedTables: StructuredTableRow[] }> {
  const tableIds = extractTableIds(query);
  if (tableIds.length === 0) return { context: "", matchedTableIds: [], matchedTables: [] };

  console.log(`[StructuredTable] Query references table IDs: ${tableIds.join(", ")}`);

  // Deduplicate and fetch only known (non-legacy) IDs from DB
  const LEGACY_IDS = new Set(["503", "1004.1.2", "1004.1"]);
  const fetchIds = tableIds.filter(id => !LEGACY_IDS.has(id));

  if (fetchIds.length === 0) return { context: "", matchedTableIds: [], matchedTables: [] };

  const { data: rows, error } = await supabaseAdmin
    .from("sbc_code_tables")
    .select("table_id, table_title, source_code, edition, content_md, notes, supersedes")
    .in("table_id", fetchIds)
    .order("table_id");

  if (error) {
    console.error("[StructuredTable] DB error:", error.message);
    return { context: "", matchedTableIds: [], matchedTables: [] };
  }

  if (!rows || rows.length === 0) {
    console.log("[StructuredTable] No rows found for IDs:", fetchIds.join(", "));
    return { context: "", matchedTableIds: [], matchedTables: [] };
  }

  console.log(`[StructuredTable] Found ${rows.length} structured table(s): ${rows.map((r: any) => r.table_id).join(", ")}`);

  // Build context block — injected BEFORE the storage chunk context.
  //
  // CHANGED 2026-08-23. The block used to open with "DB-AUTHORITATIVE — CITE
  // THESE VERBATIM" and call itself "the PRIMARY authoritative source". That
  // instruction is a life-safety defect: docs/audits/SAFETY-ALERT-code-tables-
  // 20260823.md proved by comparison against the SBC PDFs that stored rows
  // carry INVERTED requirements (Table 1017.2 told the model an H-1 hazardous
  // building may travel 75 ft unsprinklered, where the code says NOT
  // PERMITTED). The SELECT above returns no `verified` and no `normative`
  // column — neither exists on sbc_code_tables — so the block cannot state
  // which rows were checked and must not imply any were. The wording now lives
  // in ./promptContract.ts where it is unit-tested.
  const context = buildStructuredTableBlock(rows as StructuredTableRow[]);

  // matchedTables (P5) carries source_code through to the caller so it can
  // build the __sbc_table__::SBC-XXX::<table_id> response-header sentinel via
  // ./sourceSignals.ts buildTableSourceSignals() — matchedTableIds alone
  // (kept for the log line above and any other existing reader) loses that
  // field.
  return { context, matchedTableIds: rows.map((r: any) => r.table_id), matchedTables: rows as StructuredTableRow[] };
}

// ==================== VECTOR SEMANTIC SEARCH (pgvector + Gemini Embeddings) ====================

/**
 * Result of the vector path. `engine` reports which engine ACTUALLY produced
 * the context: "vector" only when match_sbc_documents returned matches that
 * survived the similarity floor, "keyword" on every fallback branch. It is
 * surfaced to the client as the X-Retrieval-Engine response header, so the
 * bench and the post-deploy smoke can tell the two paths apart from outside
 * the function. Returned rather than tracked in a module-level variable
 * because an Edge Function isolate serves concurrent requests.
 */
type VectorRetrievalResult = {
  context: string;
  files: string[];
  sourceMeta: SourcePageMeta[];
  engine: RetrievalEngine;
  /**
   * P5: sbc_documents.id for every match that survived the similarity floor
   * this call. Only ever populated on the engine==="vector" success path —
   * every keyword-fallback branch below leaves it []. Feeds the
   * sbc_external_refs honesty-block lookup in the STANDARD/ADVISORY TEXT
   * PIPELINE (index.ts, behind ADVISORY_CITATION_TOKENS_ENABLED), which per
   * task spec only runs "vector path has ids; keyword path skip".
   */
  docIds: number[];
  /**
   * G1 graph expansion (wave 2 wiring, ./graphExpansion.ts). Non-null ONLY on
   * the engine==="vector" success path, AND only when
   * ADVISORY_GRAPH_EXPANSION_ENABLED is exactly "1", AND only when the
   * expansion attempt completed without error (fail-open: any query error,
   * including the "table does not exist" case production has today, leaves
   * this null exactly like the flag was off). The value is the number of
   * expansion entries actually composed into `context` — see
   * ComposeContextResult.expansionEntries. Every keyword-fallback branch and
   * every flag-off call leaves this null, which is what tells the caller not
   * to emit X-Graph-Expansion at all (header absent = HEAD behaviour).
   */
  graphExpansionCount: number | null;
  /**
   * Non-null ONLY on a keyword-fallback branch: names which branch fired
   * ("missing_env" | "embedding_http_<status>" | "embedding_empty" |
   * "search_error" | "no_matches" | "below_floor" | "exception"). Surfaced as
   * the X-Retrieval-Fallback response header so a keyword row in the bench is
   * attributable from outside the function. Always null on the vector
   * success path.
   */
  fallbackReason: string | null;
};

/**
 * P6 reasoning-layer hints, optional and additive. Both fields default to the
 * ordinary regex/`query`-derived behaviour when omitted (or when the caller
 * passes `undefined` for a field), which is what keeps every existing call
 * site — and every call site with ADVISORY_QUERY_ANALYSIS_ENABLED off —
 * byte-identical:
 *   - embeddingQuery: text sent to the embedding model INSTEAD OF `query`.
 *     Never affects filterCode detection or keywordFallback() below, both of
 *     which keep reading the original `query` — this only enriches retrieval
 *     targeting for the vector path, never the user-visible message.
 *   - codeHint: when present, used directly as filter_code instead of the
 *     regex heuristic. keywordFallback() never sees it (fetchSBCContext takes
 *     no such parameter), matching "keyword path untouched" verbatim.
 */
type VectorReasoningHints = {
  embeddingQuery?: string;
  codeHint?: "SBC201" | "SBC801";
};

async function fetchSBCContextVector(
  query: string,
  mode: string,
  extraKeywords?: string[],
  reasoningHints?: VectorReasoningHints
): Promise<VectorRetrievalResult> {
  const keywordFallback = async (reason: string): Promise<VectorRetrievalResult> => ({
    ...(await fetchSBCContext(query, extraKeywords)),
    engine: "keyword",
    docIds: [],
    graphExpansionCount: null,
    fallbackReason: reason,
  });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = getSecretKeyOrNull();
    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !GEMINI_API_KEY) {
      console.error("[Vector RAG] Missing env vars, falling back to keyword search");
      return keywordFallback("missing_env");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    // Structural view of the SAME client for ./retrievalCache.ts. supabase-js
    // 2.90's fully-parameterised client type is too deep for TS to match
    // against RetrievalCacheClient structurally (TS2589 "type instantiation is
    // excessively deep") — the same self-referential generic problem
    // synthetic-probe/index.ts sidesteps with `type Db = any`. Compile-time
    // only: no second client is created, and nothing runs on the flag-off path.
    const cacheClient = supabaseAdmin as unknown as RetrievalCacheClient;

    // 1. Generate query embedding
    // P6: reasoningHints.embeddingQuery, when present, replaces `query` here
    // ONLY — see the VectorReasoningHints doc comment above. Falls back to
    // `query` unchanged when the hint is absent (flag off or facts did not
    // parse), so this line is byte-identical to HEAD in that case.
    // Cross-lingual augmentation applies to the EMBEDDING TEXT only — never to
    // filterCode detection, keywordFallback(), or anything the user sees.
    const embeddingSourceText = bilingualEmbeddingEnabled()
      ? augmentQueryForEmbedding(reasoningHints?.embeddingQuery ?? query)
      : (reasoningHints?.embeddingQuery ?? query);
    // The uncached computation, moved verbatim into a closure so the D1 cache
    // can wrap it without changing it: same URL, same body, same two console
    // .error lines, same two fallback reasons. The only difference is that a
    // failure now leaves through a throw instead of an early `return` — caught
    // immediately below and turned back into the identical keywordFallback().
    const computeQueryEmbedding = async (): Promise<number[]> => {
      const embResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${QUERY_EMBEDDING_MODEL_ID}:embedContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { role: "user", parts: [{ text: embeddingSourceText.substring(0, 8000) }] },
            outputDimensionality: 768,
          }),
        }
      );

      if (!embResponse.ok) {
        console.error("[Vector RAG] Embedding failed:", embResponse.status);
        throw new EmbeddingFailure(`embedding_http_${embResponse.status}`);
      }

      const embData = await embResponse.json();
      const values = embData.embedding?.values;
      if (!values) {
        console.error("[Vector RAG] No embedding returned, falling back");
        throw new EmbeddingFailure("embedding_empty");
      }
      return values as number[];
    };

    let queryEmbedding: number[];
    try {
      // Flag OFF: exactly the call the inline code made before this wiring.
      queryEmbedding = retrievalCacheEnabled()
        ? await getEmbeddingCached(
            cacheClient,
            embeddingSourceText,
            QUERY_EMBEDDING_MODEL_ID,
            computeQueryEmbedding,
          )
        : await computeQueryEmbedding();
    } catch (embErr) {
      if (embErr instanceof EmbeddingFailure) return keywordFallback(embErr.reason);
      // Anything else (a network throw from fetch, a JSON parse error) reaches
      // the outer catch and becomes fallbackReason "exception" — the same
      // taxonomy it had before, since those throws were never caught here.
      throw embErr;
    }

    // 2. Detect code type filter
    // P6: reasoningHints.codeHint (query-analysis facts.code_hint), when
    // present, is PREFERRED over the regex heuristic below — see the
    // VectorReasoningHints doc comment above. Absent (flag off, facts did not
    // parse, or the model did not state a code) falls through to the same
    // regex this branch has always run, byte-identical to HEAD.
    // detectFilterCodeFor() holds the exact regex chain (same patterns, same
    // order) that used to be inline here; the 2024-intake branches still sit
    // below 801/201 so a fire-alarm/egress phrasing keeps its historical
    // routing, and they stay unreachable while the flag is off.
    const enabledCodes = enabledNewSourceCodes();
    const filterCode: string | null = reasoningHints?.codeHint
      ?? detectFilterCodeFor(query, enabledCodes);

    // 3. Vector search
    const matchCount = mode === 'primary' ? 10 : 25;

    // ── B1b hybrid retrieval (./hybridRetrieval.ts) ─────────────────────────
    // Default OFF; exact-string "1" via ADVISORY_HYBRID_RETRIEVAL_ENABLED.
    // With the flag unset isHybridRetrievalEnabled is a single synchronous env
    // read that returns false and this block is skipped entirely — no RPC, no
    // await, no log — so the vector path below is byte-identical to HEAD.
    //
    // ON, and match_sbc_hybrid returned rows: that ONE RPC already carries the
    // pgvector signal fused with FTS, so the plain match_sbc_documents call
    // below is skipped rather than run twice.
    //
    // TUNING (2026-09-03, after the first gate FAILED — sections 52%->41%,
    // chain pairs 75%->50%, the loss concentrated in multi-section questions).
    // Equal-weight RRF let the FTS list interleave 1:1 with the vector list
    // (an FTS rank-1 row scores 1/61, beating the vector rank-2 row's 1/62),
    // so half of a 25-row context was lexical-only and the vector ranks that
    // carry a question's secondary sections were pushed out. Three knobs now
    // bound that, all applied SQL-side by
    // docs/db/20260903b_hybrid_retrieval_tuning.sql:
    //   - ftsWeight 0.5: recall of a lexically-exact chunk is kept, its
    //     ability to outrank vector evidence is halved.
    //   - vectorQuota 60% of matchCount: the top floored vector rows are
    //     GUARANTEED to be in the result and ordered first, so hybrid can
    //     never return less vector coverage than that fraction of the pure
    //     vector path — the hard bound the gate needed.
    //   - the SAME similarity floor the vector path applies below, on the
    //     VECTOR leg only: an FTS-only hit is judged by its lexical evidence
    //     (fusing two independent channels is the point), never floored on a
    //     similarity it was not ranked by. If the floor empties the vector leg
    //     entirely, fetchSBCContextHybrid declines (returns null) and the
    //     decision falls through to the vector path's own below_floor
    //     fallback rather than answering from lexical coincidence.
    // Both ratios are read through resolveFloor — not because they are floors,
    // but because it is this file's existing "finite number in [0,1] or the
    // measured default" env reader, and both knobs are exactly that.
    //
    // fetchSBCContextHybrid is fail-open by contract: null means "keep the
    // path you were already going to use" (RPC not provisioned, RPC error, or
    // zero rows), and we fall straight through to the unchanged code below.
    // graphExpansionCount/fallbackReason stay null — graph expansion is not
    // composed on this path, and nothing fell back.
    if (isHybridRetrievalEnabled(Deno.env.get)) {
      const hybridFtsWeight = resolveFloor(Deno.env.get, HYBRID_FTS_WEIGHT_ENV, HYBRID_FTS_WEIGHT_DEFAULT);
      const hybridQuotaRatio = resolveFloor(Deno.env.get, HYBRID_VECTOR_QUOTA_RATIO_ENV, HYBRID_VECTOR_QUOTA_RATIO_DEFAULT);
      const hybrid = await fetchSBCContextHybrid(
        // The text that was EMBEDDED, not the raw user query — measured
        // 2026-09-03: the SBC corpus is English (5,553 rows; an Arabic term
        // like "مرشات" or "السلامة" matches ZERO rows through the tsv column,
        // while "travel distance" matches 290 and the section number "1017.2"
        // matches 41). embeddingSourceText carries the English search terms
        // from query analysis and any derived section numbers, so it is the
        // only form of the question the lexical leg can actually match. With
        // the raw Arabic query the FTS leg returns nothing and the fusion
        // silently degrades to pure vector — hybrid in name only.
        embeddingSourceText,
        queryEmbedding,
        filterCode ? [filterCode] : null,
        matchCount,
        supabaseAdmin,
        {
          ftsWeight: hybridFtsWeight,
          vectorQuota: Math.ceil(hybridQuotaRatio * matchCount),
          minSimilarityRel: resolveFloor(Deno.env.get, VECTOR_MIN_SIMILARITY_REL_ENV, VECTOR_MIN_SIMILARITY_REL),
          minSimilarityAbs: resolveFloor(Deno.env.get, VECTOR_MIN_SIMILARITY_ABS_ENV, VECTOR_MIN_SIMILARITY_ABS),
        },
      );
      if (hybrid) {
        console.log(
          `[Hybrid RAG] ${hybrid.docIds.length} fused chunks from ${hybrid.files.length} files ` +
          `(fts_weight=${hybridFtsWeight}, vector_quota=${Math.ceil(hybridQuotaRatio * matchCount)}/${matchCount})`,
        );
        return {
          context: hybrid.context,
          files: hybrid.files,
          sourceMeta: hybrid.sourceMeta,
          engine: "hybrid",
          docIds: hybrid.docIds,
          graphExpansionCount: null,
          fallbackReason: null,
        };
      }
    }

    const { data: primaryMatches, error } = await supabaseAdmin.rpc('match_sbc_documents', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_code: filterCode,
    });

    if (error || !primaryMatches?.length) {
      console.error("[Vector RAG] Search error:", error?.message || "no matches");
      return keywordFallback(error ? "search_error" : "no_matches");
    }

    const matches = primaryMatches as any[];

    // 3b. Similarity floor (risk R6). match_sbc_documents applies NO threshold
    // in SQL — it returns the nearest `match_count` rows however far away they
    // are — and the SQL function is deliberately NOT modified here, because
    // changing it is a production schema change and therefore an owner action.
    // Measured on 2026-08-23 against the 4,594 production vectors: at
    // match_count = 25 the rank-25 median similarity (0.8084) equals the 99th
    // percentile of provably-unrelated pairs (0.8092), i.e. the tail of the
    // result set is statistically indistinguishable from random chunks. Full
    // distribution and the derivation of both floors: ./retrievalPolicy.ts.
    const relFloor = resolveFloor(Deno.env.get, VECTOR_MIN_SIMILARITY_REL_ENV, VECTOR_MIN_SIMILARITY_REL);
    const absFloor = resolveFloor(Deno.env.get, VECTOR_MIN_SIMILARITY_ABS_ENV, VECTOR_MIN_SIMILARITY_ABS);
    // SBC_VECTOR_FLOOR_MODE (2026-09-03): "drop" (default) is the behaviour
    // measured below; "gate" keeps the fallback decision but stops discarding
    // individual rows, which the model-free retrieval gate showed is worth 2
    // of 87 expected sections. Default unchanged until an answer-quality run
    // says the extra marginal chunks do not hurt.
    const floorMode = resolveFloorMode(Deno.env.get);
    const floored = applySimilarityFloor(matches as { similarity?: number | null }[], relFloor, absFloor, floorMode);

    if (floored.kept.length === 0) {
      // Everything was below the floor. Fall back rather than hand the model a
      // context built from matches we just measured to be noise. This is what
      // bounds the blast radius of a mis-set floor: the worst case is today's
      // keyword/storage path, never a thin answer presented as complete.
      console.warn(
        `[Vector RAG] All ${matches.length} matches below floor ` +
        `(top=${floored.topSimilarity?.toFixed(3)}, cut=${floored.effectiveFloor?.toFixed(3)}) — falling back to keyword`
      );
      return keywordFallback("below_floor");
    }

    if (floored.droppedCount > 0) {
      console.log(
        `[Vector RAG] Similarity floor dropped ${floored.droppedCount}/${matches.length} matches ` +
        `(cut=${floored.effectiveFloor?.toFixed(3)}, rel=${relFloor}, abs=${absFloor}, mode=${floorMode})`
      );
    }

    const acceptedMatches = floored.kept as any[];
    console.log(`[Vector RAG] Found ${acceptedMatches.length} matches, top similarity: ${floored.topSimilarity?.toFixed(3)}`);

    // 3c. Multi-topic augmentation (flag-gated, advisory/analysis only).
    // Deliberately AFTER the similarity floor: the floor is RELATIVE to the top
    // similarity of the set it is given, so merging sub-query hits in before it
    // could raise the cut line and silently drop primary matches. Running it
    // here means the primary result set — and every fallback decision above —
    // is exactly what it was with the flag off; sub-topics can only ADD.
    // Each sub-query gets its own code filter and its own floor (relative to
    // its own top), and any failure leaves `acceptedMatches` untouched.
    if (multiQueryRetrievalEnabled() && mode !== 'primary') {
      const subQueries = decomposeQuery(query);
      if (subQueries.length >= 2) {
        const subCount = Math.max(5, Math.floor(matchCount / 2));
        const keyOf = (m: any) => `${m.file_name}|${m.page_start}|${String(m.content ?? '').slice(0, 80)}`;
        const seen = new Set<string>(acceptedMatches.map(keyOf));
        const added: any[] = [];
        try {
          const results = await Promise.all(subQueries.map(async (sq) => {
            // One embedding per sub-topic, reused across the codes it touches.
            // Sub-topics are the SHORTEST texts in the pipeline, so the
            // cross-lingual gap hurts them most — augment before embedding.
            const subText = bilingualEmbeddingEnabled() ? augmentQueryForEmbedding(sq) : sq;
            // D1: same two-layer embedding cache as the primary query, same
            // model id, so a sub-topic shared by two questions is embedded
            // once. embedQueryText's own null-on-failure contract is preserved
            // on both sides — the throw/.catch pair exists only so a failure is
            // never written to either cache layer.
            const emb = retrievalCacheEnabled()
              ? await getEmbeddingCached(cacheClient, subText, QUERY_EMBEDDING_MODEL_ID, async () => {
                  const v = await embedQueryText(subText, GEMINI_API_KEY);
                  if (!v) throw new EmbeddingFailure("subquery_embedding_empty");
                  return v;
                }).catch(() => null)
              : await embedQueryText(subText, GEMINI_API_KEY);
            if (!emb) return [] as any[];
            const codes = detectFilterCodesFor(sq, enabledCodes);
            const perCode = await Promise.all(codes.map(async (code) => {
              const { data } = await supabaseAdmin.rpc('match_sbc_documents', {
                query_embedding: emb,
                match_count: subCount,
                filter_code: code,
              });
              const sub = (data ?? []) as any[];
              if (sub.length === 0) return sub;
              // Same noise floor, applied within this code's own result set.
              return applySimilarityFloor(sub as { similarity?: number | null }[], relFloor, absFloor).kept as any[];
            }));
            return perCode.flat();
          }));
          // Cap each sub-topic's contribution so one topic cannot crowd out the
          // others, and so the total stays comfortably inside the context budget.
          for (const list of results) {
            let takenFromThisTopic = 0;
            for (const m of list) {
              if (takenFromThisTopic >= PER_SUBTOPIC_LIMIT) break;
              const key = keyOf(m);
              if (seen.has(key)) continue;
              seen.add(key);
              added.push(m);
              takenFromThisTopic++;
            }
          }
        } catch (subErr) {
          console.warn(`[Vector RAG] multi-topic augmentation failed (primary result kept): ${subErr instanceof Error ? subErr.message : String(subErr)}`);
        }
        if (added.length > 0) {
          // Splice the sub-topic hits in AFTER the strongest primary matches
          // rather than appending them. The context builder below fills a
          // 120k-char budget in array order and stops — with 25 primary chunks
          // at ~3.6k chars each it can exhaust the budget on its own, so
          // appended sub-topic matches would be silently truncated away, which
          // is precisely the coverage this whole block exists to add.
          const head = acceptedMatches.slice(0, MULTI_QUERY_PRIMARY_HEAD);
          const tail = acceptedMatches.slice(MULTI_QUERY_PRIMARY_HEAD);
          acceptedMatches.length = 0;
          acceptedMatches.push(...head, ...added, ...tail);
          console.log(`[Vector RAG] multi-topic: ${subQueries.length} sub-queries added ${added.length} matches (total ${acceptedMatches.length})`);
        }
      }
    }

    // 4. Build context
    const usedFiles = [...new Set(acceptedMatches.map((m: any) => m.file_name))] as string[];
    let context = '\n=== SBC REFERENCE DOCUMENTS (Vector Search Results) ===\n';
    const contextLimit = 120000;

    // Build per-file page range from vector match page data
    const vectorMetaMap = new Map<string, { minPage: number | null; maxPage: number | null }>();
    for (const match of acceptedMatches) {
      // Code is stated EXPLICITLY in the header. Once multi-topic retrieval
      // began mixing four codes into one context, the model started quoting a
      // real requirement but labelling it with another code's section — e.g.
      // the 250 mm hazardous-exhaust duct rule (SBC 501 Section 714.4.1) cited
      // as "SBC-201 Section 903.2.11.4", which in SBC 201 is about openings in
      // basements. Making the owning code unmissable per block is half the fix;
      // the citation contract's copy-from-the-header rule is the other half.
      const entry = `\n=== ${match.file_name} | Code: ${codeFromFileName(match.file_name)} | Section: ${match.section_number || 'N/A'} | Pages: ${match.page_start}-${match.page_end} | Similarity: ${match.similarity?.toFixed(3)} ===\n${match.content}\n`;
      if (context.length + entry.length > contextLimit) break;
      context += entry;
      const m = vectorMetaMap.get(match.file_name) ?? { minPage: null, maxPage: null };
      if (match.page_start != null) m.minPage = m.minPage == null ? match.page_start : Math.min(m.minPage, match.page_start);
      if (match.page_end != null) m.maxPage = m.maxPage == null ? match.page_end : Math.max(m.maxPage, match.page_end);
      vectorMetaMap.set(match.file_name, m);
    }

    const sourceMeta: SourcePageMeta[] = usedFiles.map(file => {
      const m = vectorMetaMap.get(file);
      const hasPages = m && (m.minPage != null || m.maxPage != null);
      return {
        file,
        pageStart: m?.minPage ?? null,
        pageEnd: m?.maxPage ?? null,
        precision: hasPages ? 'page_range' : 'chunk_range_only',
      };
    });

    // docIds: same source set as usedFiles above (all matches that survived
    // the similarity floor, not gated by the contextLimit break in the loop
    // above — usedFiles already has that same characteristic, so this stays
    // consistent with what "used" already means at this call site).
    // `id` is a Postgres bigint (public.sbc_documents.id) — PostgREST/
    // supabase-js normally serialises it as a JSON number, but accept a
    // numeric string too rather than silently dropping every id if a
    // driver/PostgREST version ever stringifies bigint columns.
    const docIds = [...new Set(
      acceptedMatches
        .map((m: any) => (typeof m.id === "number" ? m.id : typeof m.id === "string" ? Number(m.id) : NaN))
        .filter((id: number) => Number.isFinite(id))
    )] as number[];

    // ── G1 graph expansion (wave 2 wiring, ./graphExpansion.ts) ─────────────
    // Default OFF; exact-string "1" via ADVISORY_GRAPH_EXPANSION_ENABLED. With
    // the flag unset this whole block is skipped — acceptedMatches is never
    // sliced and `context`/`sourceMeta`/`docIds` above (already fully built)
    // are returned exactly as they are today: byte-identical.
    //
    // Nested try/catch, deliberately NOT the outer function's catch above: any
    // failure here (sbc_xref_edges / sbc_xref_indegree do not exist in
    // production yet, so "relation does not exist" is the expected common
    // case) must fail OPEN to the unexpanded 25-seed `context` already built
    // above — NOT to keywordFallback(), which would also flip `engine` to
    // "keyword" and drop docIds, a much larger behaviour change than "graph
    // expansion didn't run this time".
    let graphExpansionCount: number | null = null;
    if (isGraphExpansionEnabled(Deno.env.get)) {
      try {
        // Design carve: the fetch above still returns up to 25 matches: only
        // the seed set actually composed into context is reduced to
        // SEED_K_EXPANDED (18), sliced deterministically off the existing
        // similarity-ordered array — no re-sort.
        const seeds: SeedMatch[] = acceptedMatches.slice(0, SEED_K_EXPANDED).map((m: any) => ({
          id: typeof m.id === "number" ? m.id : Number(m.id),
          file_name: m.file_name,
          section_number: m.section_number ?? null,
          page_start: m.page_start ?? null,
          page_end: m.page_end ?? null,
          similarity: typeof m.similarity === "number" ? m.similarity : null,
          content: m.content,
        }));

        const querySpec = buildExpansionQuerySpec(seeds);

        let edges: XrefEdge[] = [];
        if (querySpec.srcDocIds.length > 0) {
          const { data: edgeRows, error: edgeErr } = await supabaseAdmin
            .from("sbc_xref_edges")
            .select("src_doc_id, tgt_doc_id, tgt_code, tgt_section, edge_kind, cue, evidence")
            .in("src_doc_id", querySpec.srcDocIds)
            .eq("edge_kind", querySpec.edgeKind);
          if (edgeErr) throw edgeErr;
          edges = (edgeRows ?? []) as XrefEdge[];
        }

        const targetIds = [...new Set(edges.map((e) => e.tgt_doc_id))];
        const indegree: IndegreeMap = new Map();
        if (targetIds.length > 0) {
          const { data: indegreeRows, error: indegreeErr } = await supabaseAdmin
            .from("sbc_xref_indegree")
            .select("doc_id, in_degree")
            .in("doc_id", targetIds);
          if (indegreeErr) throw indegreeErr;
          for (const row of (indegreeRows ?? []) as { doc_id: number; in_degree: number }[]) {
            indegree.set(row.doc_id, row.in_degree);
          }
        }

        const candidates = selectExpansionTargets(seeds, edges, indegree);

        const contentById: ContentById = new Map();
        if (candidates.length > 0) {
          const candidateIds = [...new Set(candidates.map((c) => c.docId))];
          const { data: contentRows, error: contentErr } = await supabaseAdmin
            .from("sbc_documents")
            .select("id, file_name, section_number, page_start, page_end, content")
            .in("id", candidateIds);
          if (contentErr) throw contentErr;
          for (const row of (contentRows ?? []) as {
            id: number;
            file_name: string;
            section_number: string | null;
            page_start: number | null;
            page_end: number | null;
            content: string;
          }[]) {
            contentById.set(row.id, {
              file_name: row.file_name,
              section_number: row.section_number,
              page_start: row.page_start,
              page_end: row.page_end,
              content: row.content,
            });
          }
        }

        const composed = composeContext(seeds, candidates, contentById);
        context = composed.contextText;
        graphExpansionCount = composed.expansionEntries;
      } catch (expansionErr) {
        // Fail-open: `context` stays exactly what the unexpanded loop above
        // built (the pre-existing 25-seed composition). No header is emitted
        // for a failed attempt — from outside, a failed ON attempt must look
        // identical to OFF.
        console.error("[Graph Expansion] Fail-open, falling back to unexpanded context:", expansionErr);
        graphExpansionCount = null;
      }
    }

    return { context, files: usedFiles, sourceMeta, engine: "vector", docIds, graphExpansionCount, fallbackReason: null };
  } catch (err) {
    console.error("[Vector RAG] Fatal error:", err);
    return keywordFallback("exception");
  }
}

// ===========================================================================
// D1 RETRIEVAL-RESULT CACHE — key recipe + the "never cache a fallback" guard
// ===========================================================================
//
// Wrapped at the ADVISORY TEXT call site only (see the handler below), which
// is what keeps two things true without a second flag: the VISION path calls
// fetchSBCContextVector directly and is never cached (its retrieval is one
// leg of an image-dependent pipeline), and the multi-topic sub-query RPCs are
// never cached individually — they are part of the ONE cached primary result.

/**
 * Carries a keyword-fallback result out of the cached compute() closure by
 * throwing, so getRetrievalCached never stores it. Caching a fallback would
 * pin a query to the keyword path for the full 24h TTL on the strength of one
 * transient failure (a 429 on the embedding call, a momentary RPC error) —
 * the opposite of the fail-open behaviour every layer here is built around.
 * The result is not lost: the call site catches this and uses `.result`
 * exactly as if the cache were not in the picture.
 */
class UncachedRetrievalFallback extends Error {
  result: VectorRetrievalResult;
  constructor(result: VectorRetrievalResult) {
    super(`retrieval fallback (${result.fallbackReason ?? "unknown"}) — not cached`);
    this.name = "UncachedRetrievalFallback";
    this.result = result;
  }
}

/**
 * The retrieval cache key parts, in the order docs/launch/retrieval-cache-notes.md
 * fixes: [embedding key, sorted codes, mode, flags version, corpus_version].
 * getRetrievalCached only joins-then-hashes them, so getting this list right
 * is the caller's job — this is the single place that builds it.
 *
 * - embedding key reproduces getEmbeddingCached's own recipe verbatim
 *   (cacheKey(["embedding", modelId, normalizeForKey(text)])), per that
 *   module's "KEY RECIPES" note. It is built from the PRE-augmentation
 *   embedding text: augmentQueryForEmbedding is a deterministic function of
 *   that text plus one env flag, so two different augmented texts always come
 *   from two different pre-augmentation texts — the key stays collision-free,
 *   and the flag itself is covered by the fingerprint below.
 * - codes is the same filter fetchSBCContextVector will compute internally
 *   (codeHint first, else the regex chain), sorted so ordering can never
 *   split one logical key in two. [] renders as "" — "no code filter".
 * - mode selects match_count (10 vs 25), so it changes the result set.
 * - flags version = runtime_settings.retrieval_flags_version + the live env
 *   flag fingerprint; see retrievalFlagFingerprint above for why both.
 * - corpus_version is the global epoch: bumping it invalidates every row.
 *
 * Nothing user-scoped is in this list, by design — user_memory, conversation
 * history and attachments never reach retrieval, and a shared corpus cache
 * only pays off when hits cross sessions (retrievalCache.ts, "PRIVACY
 * ARGUMENT").
 */
async function buildRetrievalCacheKeyParts(
  client: RetrievalCacheClient,
  embeddingText: string,
  codes: string[],
  mode: string,
): Promise<string[]> {
  const [embeddingKey, flagsVersion, corpusVersion] = await Promise.all([
    cacheKey(["embedding", QUERY_EMBEDDING_MODEL_ID, normalizeForKey(embeddingText)]),
    getRetrievalFlagsVersion(client),
    getCorpusVersion(client),
  ]);
  return [
    embeddingKey,
    [...codes].sort().join(","),
    mode,
    `${flagsVersion}|${retrievalFlagFingerprint()}`,
    String(corpusVersion),
  ];
}

// ==================== GEMINI FORMAT CONVERTER ====================

function convertToGeminiFormat(messages: any[]) {
  const systemParts: string[] = [];
  const contents: any[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content));
    } else {
      const role = msg.role === "assistant" ? "model" : "user";
      if (typeof msg.content === "string") {
        contents.push({ role, parts: [{ text: msg.content }] });
      } else if (Array.isArray(msg.content)) {
        const parts = msg.content.map((part: any) => {
          if (part.type === "text") return { text: part.text };
          if (part.type === "image_url") {
            const url = part.image_url.url;
            const match = url.match(/^data:(.+?);base64,(.+)$/s);
            if (match) return { inline_data: { mime_type: match[1], data: match[2] } };
            return { text: "[image]" };
          }
          return { text: JSON.stringify(part) };
        });
        contents.push({ role, parts });
      }
    }
  }

  return {
    systemInstruction: systemParts.length > 0
      ? { parts: [{ text: systemParts.join("\n\n") }] }
      : undefined,
    contents,
  };
}

// ==================== VISION PIPELINE (5-STAGE MISSION JOURNEY) ====================

async function callAINonStreaming(apiKey: string, systemPrompt: string, userContent: any[]): Promise<string> {
  const { systemInstruction, contents } = convertToGeminiFormat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ]);

  const available = await fetchAvailableGeminiModels(apiKey);
  // GA flash-first, same as the streaming path (key-rotation + slow-preview
  // incident 2026-08-31). Was gemini-3.1-pro-preview which timed advisory out.
  const models = buildModelChain("gemini-3.7-flash", "gemini-3.6-flash", available);
  console.log(`[Gemini] Non-streaming model chain: ${models.join(" -> ")}`);

  let lastErrorText = "";
  let lastStatus = 0;

  for (const model of models) {
    const { response, errorText } = await fetchGeminiNonStreamingWithRetry(apiKey, model, systemInstruction, contents);
    if (response.ok) {
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }
    lastErrorText = errorText;
    lastStatus = response.status;
    console.error(`[Gemini] Non-streaming ${model} failed: ${response.status} | ${errorText.slice(0, 300)}`);
  }

  const classified = classifyGeminiError(lastStatus, lastErrorText);
  console.error(`[Gemini] Non-streaming all models exhausted | ${classified.logSafe}`);
  throw new Error(`AI call failed: ${classified.classification}`);
}

function getVisionPlanningPrompt(language: string): string {
  return language === "en"
    ? `You are a fire safety document intelligence agent. Your task is to extract ALL readable information from the uploaded engineering drawing or image with maximum precision.

CRITICAL RULE: Only report what is EXPLICITLY visible or readable. Never fabricate room labels, measurements, system names, or symbols. If something is unclear or illegible, say so explicitly.

Extract the following in order:

1. DOCUMENT TYPE — select the best match:
   floor_plan | reflected_ceiling_plan | fire_suppression_plan | fire_alarm_plan | mechanical_plan | site_plan | section_elevation | schedule_table | specification | mixed | unclear

2. SHEET CONTEXT (only if explicitly labeled):
   - Sheet title (exact text if visible)
   - Sheet number (exact if visible, e.g. "FP-101")
   - Scale (e.g. "1:100", "NTS")
   - Date or revision (if shown)

3. BUILDING CLASSIFICATION:
   - Building type (based on visible labels/use)
   - Occupancy Group per SBC 201 Chapter 3 (A-1 through U) — only if determinable
   - Hazard Level (Low / Ordinary G1 / Ordinary G2 / Extra Hazard G1 / Extra Hazard G2) — only if determinable
   - Number of stories (if visible or labeled)
   - Floor area (only if dimensioned or labeled)

4. VISIBLE ELEMENTS (list only what is explicitly readable):
   - Room labels and functions (exact text as shown)
   - Dimension annotations (e.g. "6000mm", "20'")
   - Fire protection system labels (sprinkler heads, detectors, alarm devices, standpipes, hydrants, suppression nozzles)
   - Legend/symbol key (describe each symbol and its associated label exactly as shown)
   - Fire-rated elements (fire doors labeled, fire walls, smoke partitions — exact labels)
   - Exit routes, stairwells, corridors (as labeled)
   - Equipment schedules visible in the drawing

5. IMAGE QUALITY:
   - Overall quality: clear | partial | low | illegible
   - Readable areas: (list clearly legible zones or content)
   - Unreadable areas: (list illegible, cut-off, or too-small-to-read content)
   - Classification confidence: high | medium | low

Respond ONLY in valid JSON (no markdown, no explanation outside JSON):
{
  "documentType": "...",
  "sheetContext": {"title":"...","number":"...","scale":"...","date":"..."},
  "buildingType": "...",
  "occupancyGroup": "...",
  "hazardLevel": "...",
  "stories": "...",
  "floorArea": "...",
  "roomLabels": ["..."],
  "dimensions": ["..."],
  "visibleSystems": ["..."],
  "legendSymbols": ["..."],
  "fireRatedElements": ["..."],
  "exitElements": ["..."],
  "observations": ["..."],
  "readableAreas": ["..."],
  "unreadableAreas": ["..."],
  "imageQuality": "clear|partial|low|illegible",
  "classificationConfidence": "high|medium|low"
}`
    : `أنت عميل ذكاء وثائقي للسلامة من الحرائق. مهمتك استخراج جميع المعلومات المقروءة من المخطط الهندسي أو الصورة المرفوعة بأقصى دقة ممكنة.

قاعدة حرجة: لا تُبلّغ إلا عمّا هو مرئي وصريح. لا تخترع أسماء غرف أو قياسات أو أنظمة أو رموزاً. إذا كان شيء غير واضح أو غير مقروء، صرّح بذلك.

استخرج ما يلي بالترتيب:

1. نوع الوثيقة — اختر الأنسب:
   مخطط_طابق | مخطط_سقف_معكوس | مخطط_إطفاء | مخطط_إنذار | مخطط_ميكانيكي | مخطط_موقع | قطاع_واجهة | جدول_بيانات | مواصفات | مختلط | غير_محدد

2. سياق الورقة (فقط إذا كان مسمى صراحةً):
   - عنوان الورقة (النص الحرفي إن ظهر)
   - رقم الورقة (مثل FP-101)
   - المقياس (مثل 1:100)
   - التاريخ أو رقم المراجعة

3. التصنيف:
   - نوع المبنى
   - مجموعة الإشغال حسب SBC 201 الفصل 3
   - مستوى الخطورة
   - عدد الطوابق (إذا مذكور)
   - المساحة (فقط إذا مُقاسة أو مُسماة)

4. العناصر المرئية (ما يُقرأ صراحةً فقط):
   - تسميات الغرف ووظائفها (النص الحرفي)
   - الأبعاد المُدرجة
   - رموز وتسميات أنظمة الحماية
   - مفتاح الرموز (وصف كل رمز وتسميته)
   - العناصر المقاومة للحريق
   - المخارج والسلالم والممرات
   - جداول المعدات

5. جودة الصورة:
   - الجودة العامة: واضحة | جزئية | منخفضة | غير مقروءة
   - المناطق المقروءة
   - المناطق غير المقروءة
   - ثقة التصنيف: عالية | متوسطة | منخفضة

أجب فقط بـ JSON صالح (بدون شرح خارج JSON):
{
  "documentType": "...",
  "sheetContext": {"title":"...","number":"...","scale":"...","date":"..."},
  "buildingType": "...",
  "occupancyGroup": "...",
  "hazardLevel": "...",
  "stories": "...",
  "floorArea": "...",
  "roomLabels": ["..."],
  "dimensions": ["..."],
  "visibleSystems": ["..."],
  "legendSymbols": ["..."],
  "fireRatedElements": ["..."],
  "exitElements": ["..."],
  "observations": ["..."],
  "readableAreas": ["..."],
  "unreadableAreas": ["..."],
  "imageQuality": "clear|partial|low|illegible",
  "classificationConfidence": "high|medium|low"
}`;
}

function getVisionCoTPrompt(planningResult: string, language: string): string {
  return language === "en"
    ? `Based on this building classification:
${planningResult}

Build a structured checklist of SBC code sections to verify. For each item, specify:
- The exact SBC section number (e.g., SBC 801 Section 903.2.x, SBC 201 Table 1006.3.x)
- What to check
- Why it's relevant

Also provide search keywords that should be used to find relevant code sections.

Respond in JSON format:
{"checklist":[{"section":"...","check":"...","reason":"..."}],"searchKeywords":["..."]}`
    : `بناءً على تصنيف المبنى التالي:
${planningResult}

أنشئ قائمة فحص منظمة لأقسام كود SBC التي يجب التحقق منها. لكل عنصر حدد:
- رقم المادة الدقيق
- ما يجب فحصه
- سبب الأهمية

وقدم كلمات بحث لاسترجاع الأقسام ذات الصلة.

أجب بصيغة JSON:
{"checklist":[{"section":"...","check":"...","reason":"..."}],"searchKeywords":["..."]}`;
}

// ==================== VISION ADVISORY FINAL PROMPT (for Advisory/Standard mode) ====================
// Used when images are submitted in Advisory mode — goal is design guidance, NOT compliance audit.
function getVisionAdvisoryFinalPrompt(language: string): string {
  const lang = language === "en" ? "ENGLISH" : "ARABIC";
  return `[SYSTEM — ConsultX | VISION ANALYSIS - ADVISORY MODE - DESIGN GUIDANCE]

${CORE_RULES}

You are generating DESIGN ADVISORY guidance for an engineering drawing that has been processed through a multi-stage pipeline.

CRITICAL FRAMING: The engineer is at the DESIGN STAGE — they need to know what to design, not whether something built is compliant.
Your goal is NOT to audit a finished design.
Your goal IS to help the engineer understand what fire safety systems and code requirements apply.

YOUR RESPONSE MUST follow this EXACT structure:

## 🔍 الحقائق المرئية / Extracted Facts

List ONLY what is explicitly visible or readable in the drawing:
- Building type, apparent use, and occupancy clues
- Number of floors and approximate areas (if readable)
- Existing labeled systems, spaces, or elements
- Any schedules, legends, or notes visible

State explicitly which items are INFERRED (not labeled) vs CONFIRMED (explicitly labeled).
If a label is unclear or unreadable — say so. Never fabricate room names or functions.

## 📋 المتطلبات الواجب تصميمها / Required Systems to Design

Based on the building type/occupancy identified above, list what the code requires:

For each required system or element:
**النظام / System:** [name] | **المرجع / Code Basis:** [Document + Section] | **المعامل الرئيسي / Key Parameter:** [value or requirement]

Show the reasoning: occupancy → code path → requirement.
If classification is uncertain, present all possible paths — do not assume one.

## 📜 المراجع التقنية / Technical References

<details>
<summary><strong>SBC 201 & SBC 801 Relevant Sections</strong></summary>

For each cited section:
- **Section:** [exact number]
- **Verbatim Quote:** > [exact English text]
- **Design Implication:** [what this means the engineer must design]

</details>

## ❓ البيانات الناقصة / Missing Information

List any information not visible that would change the requirements:
- [ ] [missing item] — [why it affects the required systems]

RESPOND IN: ${lang}`;
}

function getVisionFinalPrompt(language: string): string {
  const lang = language === "en" ? "ENGLISH" : "ARABIC";
  return `[SYSTEM — ConsultX | VISION ANALYSIS — COMPLIANCE AUDIT — SENIOR REVIEWER GRADE]

${CORE_RULES}

You are generating the final compliance audit for an engineering drawing that has been processed through a multi-stage pipeline.
You will receive:
1. The original image(s)
2. Document Intelligence Summary (Stage 1 extraction — includes image quality, document type, extracted elements)
3. Chain of Thought checklist (Stage 2)
4. SBC reference documents retrieved (Stage 3)

CRITICAL FRAMING:
- The Document Intelligence Summary tells you what was ACTUALLY readable from the drawing.
- Only use extraction data that is explicitly marked as read/confirmed — never fabricate labels, dimensions, or symbols.
- If extraction quality is LOW or ILLEGIBLE, you MUST downgrade your confidence accordingly and request missing information.
- Apply the FULL analytical protocol below — do not skip sections.

═══════════════════════════════════════
EPISTEMIC STATE RULES (apply throughout):
═══════════════════════════════════════
- [CONFIRMED]: explicitly visible/readable in the drawing or from provided text
- [INFERRED]: reasonable derivation — must be labeled as inference, not fact
- [REQUIRES CONFIRMATION]: possible but not established — must be flagged
- [CANNOT CONCLUDE]: impossible to judge — prohibited from compliance verdict

═══════════════════════════════════════
YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE:
═══════════════════════════════════════

## I. تصنيف المشروع / Project Classification

- **نوع الوثيقة / Document Type:** [from extraction] — [CONFIRMED / INFERRED]
- **نوع المبنى / Building Type:** [value] — [CONFIRMED / INFERRED]
- **الإشغال / Occupancy Group:** [SBC 201 Chapter 3 classification] — [CONFIRMED / INFERRED]
- **مستوى الخطورة / Hazard Level:** [value] — [CONFIRMED / INFERRED]
- **الطوابق / Stories:** [value] — [CONFIRMED / INFERRED / CANNOT CONCLUDE]
- **المساحة / Floor Area:** [value] — [CONFIRMED / INFERRED / CANNOT CONCLUDE]
- **الرشاشات / Sprinklers:** [present / absent / not determinable]
- **ثقة التصنيف / Classification Confidence:** [High / Medium / Low] — based on extraction quality

## II. ملخص الاستخراج / Extraction Summary

- **جودة الصورة / Image Quality:** [clear / partial / low / illegible]
- **المناطق المقروءة / Readable:** [list from Stage 1]
- **المناطق غير المقروءة / Unreadable:** [list from Stage 1 — these create uncertainty zones]
- **تحذير استخراج / Extraction Warning:** [if quality is low/illegible — state that conclusions in affected areas are unreliable]

## III. مسار الكود الحاكم / Governing Code Path

- SBC 201: [Chapter/Section] — السبب: [why this path]
- SBC 801: [Chapter/Section] — السبب: [why this path]
- تعارضات / Conflicts: [any conflicting code paths or interpretations]

## IV. الاشتراطات الرئيسية / Key Requirements

| الاشتراط | المرجع (Document + Section) | القيمة / المعامل | التوفر |
|---|---|---|---|
| ... | ... | ... | مؤكد / يحتاج تحقق |

## V. جدول الامتثال / Compliance Table

| العنصر | المتطلب | المرجع (Document + Section + Page) | الحالة | الأساس |
|---|---|---|---|---|
| ... | ... | Document: X \| Section: Y | ✅ متوافق / ❌ غير متوافق / ⚠️ يحتاج تحقق | [CONFIRMED / INFERRED] |

**قواعد الجدول الصارمة:**
- ✅ متوافق: فقط بنص مرجعي صريح + بيانات مستخرجة مؤكدة
- ❌ غير متوافق: فقط بنص مرجعي صريح + دليل مستخرج مؤكد
- ⚠️ يحتاج تحقق: بيانات غير مقروءة، مرجع غير متوفر، أو استنتاج غير مؤكد

## VI. مناطق الخطر والتعارض / Risk Areas & Conflicts

- **[العنصر]** — [وصف الخطر] — المرجع: [Document + Section]
- إذا كانت المناطق غير مقروءة: اذكرها صراحة كمناطق خطر غير محققة

## VII. المعلومات الحرجة الناقصة / Missing Critical Information

- [ ] [المعلومة الناقصة] — [تأثيرها على الحكم]
- [ ] [عناصر غير مقروءة من الاستخراج] — [تأثيرها]

## VIII. السند التقني / Technical References

<details>
<summary><strong>SBC 801 References</strong></summary>

For each section cited above:
- **Section:** [exact number]
- **Verbatim Quote:** > [exact English text]
- **Applicability to this drawing:** [how it applies]

</details>

<details>
<summary><strong>SBC 201 References</strong></summary>

[Same format as SBC 801 section above]

</details>

## IX. حكم الامتثال / Compliance Verdict

⚠️ يُصدر هذا الحكم فقط إذا كانت المعطيات الحرجة مؤكدة وجودة الاستخراج كافية:

- **الحكم:** [✅ متوافق / ❌ غير متوافق / ⚠️ مشروط / 🔲 غير محدد — بيانات غير كافية]
- **الأساس:** "هذا الحكم مبني على [المعطيات المستخدمة] ويفترض [الافتراضات المُعتمدة]"
- **تحفظات الاستخراج:** [إذا كانت جودة الصورة تُقيّد الحكم — اذكر ذلك صراحة]
- **ختام إلزامي:** "هذا التحليل يمثل الحد الأدنى الفني وفق الكود ويخضع لموافقة الدفاع المدني بناءً على تعاميمه العامة والخاصة وتقييم المخاطر الميدانية"

## X. الإجراءات المطلوبة / Required Actions

- [ ] [الإجراء] — الأولوية: [🔴 حرجة / 🟠 عالية / 🟡 متوسطة]

RESPOND IN: ${lang}`;
}

async function runVisionPipeline(
  apiKey: string,
  imageBase64s: string[],
  userQuery: string,
  language: string,
  mode: string = "analysis",
  // P7 (vision page-manifest wiring). Both default to the "feature off" shape
  // ([] / false) so every existing call in this codebase — and any future one
  // that does not pass these — reproduces today's byte-identical prompts.
  // pageManifests is expected pre-sanitized (./visionManifest.ts's
  // sanitizeManifestEntries) by the caller; this function does no further
  // validation of it. pageManifestFeatureEnabled is the single resolved
  // VISION_PAGE_MANIFEST_ENABLED flag value (Deno.env.get, exact string "1"),
  // read exactly once by the caller — this function never touches Deno.env.
  pageManifests: PageManifestEntry[] = [],
  pageManifestFeatureEnabled: boolean = false,
): Promise<{ systemPrompt: string; extraContext: string; usedFiles: string[]; sourceMeta: SourcePageMeta[]; engine: RetrievalEngine; graphExpansionCount: number | null }> {
  console.log("🎯 === VISION PIPELINE START ===", imageBase64s.length, "image(s)");
  const pipelineStart = Date.now();

  // Stage 1: Planning Agent
  console.log("📋 Stage 1: Planning Agent...");
  // P7: with the flag off (default) or unset, planningPrompt is EXACTLY
  // getVisionPlanningPrompt(language) — byte-identical to HEAD. With the flag
  // on, the Stage-1 JSON contract extension (legend-first reading order +
  // five new fields) is always appended, and the PAGE RENDER MANIFEST block
  // is appended additionally whenever the caller actually sanitized at least
  // one manifest entry (a plain image upload with no PDF pages has none, and
  // gets the contract extension only).
  let planningPrompt = getVisionPlanningPrompt(language);
  if (pageManifestFeatureEnabled) {
    planningPrompt += "\n\n" + LEGEND_JSON_CONTRACT_EXTENSION;
    if (pageManifests.length > 0) {
      planningPrompt += "\n\n" + buildPageManifestBlock(pageManifests);
    }
  }
  const imageContent: any[] = [
    ...imageBase64s.map((url: string) => ({ type: "image_url", image_url: { url } })),
    { type: "text", text: userQuery || (language === "en" ? "Analyze this engineering drawing for fire safety compliance." : "حلل هذا المخطط الهندسي من ناحية الامتثال للسلامة من الحرائق.") },
  ];

  let planningResult: string;
  try {
    planningResult = await callAINonStreaming(apiKey, planningPrompt, imageContent);
    console.log("✅ Stage 1 complete:", planningResult.slice(0, 200));
  } catch (err) {
    console.error("❌ Stage 1 failed:", err);
    planningResult = '{"buildingType":"unknown","occupancyGroup":"unknown","hazardLevel":"unknown","observations":["Image analysis failed"]}';
  }

  // Stage 2: Chain of Thought
  console.log("🧠 Stage 2: Chain of Thought...");
  const cotPrompt = getVisionCoTPrompt(planningResult, language);
  let cotResult: string;
  let searchKeywords: string[] = [];
  try {
    cotResult = await callAINonStreaming(apiKey, cotPrompt, [{ type: "text", text: planningResult }]);
    console.log("✅ Stage 2 complete:", cotResult.slice(0, 200));

    try {
      const cotParsed = JSON.parse(cotResult.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      if (cotParsed.searchKeywords) {
        searchKeywords = cotParsed.searchKeywords;
      }
    } catch {
      const kwMatch = cotResult.match(/searchKeywords.*?\[(.*?)\]/s);
      if (kwMatch) {
        searchKeywords = kwMatch[1].split(",").map(k => k.trim().replace(/"/g, ""));
      }
    }
  } catch (err) {
    console.error("❌ Stage 2 failed:", err);
    cotResult = '{"checklist":[],"searchKeywords":[]}';
  }

  // P7: fold Stage-1's legend_symbols (only ever present in planningResult
  // when the flag above actually asked the model for them) additively into
  // the Stage-2 search keywords, BEFORE Stage 3 consumes searchKeywords.
  // parseLegendSymbols is fail-open — a flag-off contract (no legend_symbols
  // field), a Stage-1 parse failure, or the model simply omitting the field
  // all yield [] here, making this a no-op and leaving searchKeywords exactly
  // what Stage 2 produced, byte-identical to HEAD.
  if (pageManifestFeatureEnabled) {
    const legendSymbols = parseLegendSymbols(planningResult);
    if (legendSymbols.length > 0) {
      searchKeywords = mergeLegendKeywords(searchKeywords, legendSymbols);
    }
  }

  // Stage 3: Parallel Processing - fetch SBC context
  console.log("⚡ Stage 3: Parallel Processing (SBC retrieval)...");
  const enhancedQuery = `${userQuery} ${planningResult}`;
  // The image path uses the vector engine UNCONDITIONALLY and always has — the
  // ADVISORY_VECTOR_RETRIEVAL_ENABLED flag does NOT gate it, and this call is
  // deliberately left unchanged. The literal 'analysis' below is only the
  // match_count selector (10 for 'primary', 25 otherwise); it is not the user's
  // mode. runVisionPipeline serves image-attached requests in all three modes
  // (the caller remaps primary to standard FRAMING before calling).
  const { context: sbcContext, files: usedFiles, sourceMeta, engine, graphExpansionCount } = await fetchSBCContextVector(enhancedQuery, 'analysis', searchKeywords);
  console.log(`✅ Stage 3 complete: ${sbcContext.length} chars from ${usedFiles.length} files [engine=${engine}]`);

  // Stage 4 & 5 combined
  console.log("🔀 Stage 4-5: Merge + Final Response (will be streamed)...");

  // ── Build Document Intelligence Summary from Stage 1 results ─────────────
  // Parse the planning JSON to extract quality/confidence metadata so the
  // final analytical prompt knows what was actually readable from the drawing.
  let docIntelSummary = "";
  try {
    const planParsed = JSON.parse(planningResult.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    const quality = planParsed.imageQuality || "unknown";
    const confidence = planParsed.classificationConfidence || "unknown";
    const docType = planParsed.documentType || "unknown";
    const readableAreas: string[] = planParsed.readableAreas || [];
    const unreadableAreas: string[] = planParsed.unreadableAreas || [];
    const roomLabels: string[] = planParsed.roomLabels || [];
    const visibleSystems: string[] = planParsed.visibleSystems || [];
    const legendSymbols: string[] = planParsed.legendSymbols || [];
    const dimensions: string[] = planParsed.dimensions || [];
    const sheetCtx = planParsed.sheetContext || {};

    const qualityWarning = (quality === "low" || quality === "illegible")
      ? `\n⚠️ EXTRACTION WARNING: Image quality is "${quality}". Conclusions in unreadable areas are UNRELIABLE. Do NOT fabricate elements not confirmed by extraction. Downgrade compliance confidence accordingly.`
      : "";

    docIntelSummary = `
=== DOCUMENT INTELLIGENCE SUMMARY (Stage 1 Extraction) ===
Input Type: ${docType}
Sheet: ${sheetCtx.title || "unknown"} | Number: ${sheetCtx.number || "N/A"} | Scale: ${sheetCtx.scale || "N/A"}
Image Quality: ${quality}
Classification Confidence: ${confidence}
Readable Areas: ${readableAreas.length > 0 ? readableAreas.join("; ") : "not specified"}
Unreadable Areas: ${unreadableAreas.length > 0 ? unreadableAreas.join("; ") : "none reported"}
Room Labels Extracted: ${roomLabels.length > 0 ? roomLabels.join(", ") : "none"}
Fire Systems Visible: ${visibleSystems.length > 0 ? visibleSystems.join(", ") : "none"}
Legend Symbols: ${legendSymbols.length > 0 ? legendSymbols.join(", ") : "none"}
Dimensions: ${dimensions.length > 0 ? dimensions.join(", ") : "none"}
Building Type (extracted): ${planParsed.buildingType || "unknown"}
Occupancy (extracted): ${planParsed.occupancyGroup || "unknown"}
Hazard Level (extracted): ${planParsed.hazardLevel || "unknown"}
Stories (extracted): ${planParsed.stories || "unknown"}
Floor Area (extracted): ${planParsed.floorArea || "unknown"}${qualityWarning}
=== END DOCUMENT INTELLIGENCE SUMMARY ===
`;
    console.log(`[DocIntel] Quality: ${quality} | Confidence: ${confidence} | DocType: ${docType} | Rooms: ${roomLabels.length} | Systems: ${visibleSystems.length}`);
  } catch {
    docIntelSummary = `
=== DOCUMENT INTELLIGENCE SUMMARY (Stage 1 Extraction) ===
Extraction: Stage 1 JSON parse failed — raw classification data follows in Stage 1 block below.
Image Quality: unknown
Classification Confidence: low
⚠️ EXTRACTION WARNING: Classification metadata unavailable. Use only visually confirmed elements. Do not fabricate details.
=== END DOCUMENT INTELLIGENCE SUMMARY ===
`;
    console.warn("[DocIntel] Failed to parse Stage 1 JSON for summary");
  }

  // Advisory mode (standard) → design guidance framing; Analytical (analysis) or Primary → compliance audit framing
  const finalSystemPrompt = mode === "standard"
    ? getVisionAdvisoryFinalPrompt(language)
    : getVisionFinalPrompt(language);

  const extraContext = `
${docIntelSummary}
=== PIPELINE STAGE 1: PLANNING AGENT CLASSIFICATION (raw) ===
${planningResult}

=== PIPELINE STAGE 2: CHAIN OF THOUGHT CHECKLIST ===
${cotResult}

${sbcContext}
`;

  console.log(`🎯 === VISION PIPELINE STAGES 1-3 DONE in ${Date.now() - pipelineStart}ms ===`);

  return { systemPrompt: finalSystemPrompt, extraContext, usedFiles, sourceMeta, engine, graphExpansionCount };
}

/**
 * Render user-uploaded text documents (CSV/TXT/schedule files) as the
 * per-file blocks that go into the system prompt.
 *
 * EXTRACTED 2026-08-25 (P2) from the inline loop in the handler's document
 * injection section, unchanged: same 8,000-char per-file truncation, same
 * "...[truncated]" suffix, same delimiters. It is a function now only so the
 * standard/advisory branch can weigh the blocks against the combined context
 * budget (see ./contextBudget.ts) BEFORE they are concatenated, while the
 * injection section keeps producing byte-identical output for every branch.
 */
function buildDocTextBlocks(docTexts: Array<{ name: string; content: string }>): string[] {
  return docTexts.map((doc) => {
    const truncated = doc.content.length > 8000 ? doc.content.slice(0, 8000) + "\n...[truncated]" : doc.content;
    return `\n--- File: ${doc.name} ---\n${truncated}\n--- End of ${doc.name} ---\n`;
  });
}

// ==================== MAIN HANDLER ====================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Declared outside try so the catch block can read them for error messages
  // and quota rollback. Use `any` to avoid brittle Supabase client typing.
  let adminClient: any;
  let language: "en" | "ar" = "en";

  try {
    let userId: string;
    let userEmail = "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Please login to continue" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Stage timing (observability, 2026-09-02 speed wave) ──────────────────
    // Collected per request and printed once in the [Timing] summary right
    // before the stream is returned; measures the full pre-first-byte path.
    const reqStart = Date.now();
    const stageLog: string[] = [];
    const markStage = (name: string) => { stageLog.push(`${name}=+${Date.now() - reqStart}ms`); };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getPublishableKey(),
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session, please login again" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    userId = user.id;
    userEmail = user.email || "";
    console.log(`✅ Authenticated user: ${userId}`);
    markStage("auth");

    // Parse body first — mode is needed for per-mode trial limit checks
    const body = await req.json();
    const { messages, retry, mode = "standard", image, images, documentTexts, pageManifests, output_format, preferred_standards, audience, conversation_id } = body;
    language = body.language === "en" ? "en" : "ar";
    const resolvedImages: string[] = images ?? (image ? [image] : []);
    // documentTexts: [{name: string, content: string}] — CSV/TXT files extracted by frontend
    const resolvedDocTexts: Array<{ name: string; content: string }> = Array.isArray(documentTexts) ? documentTexts : [];
    // pageManifests: PageManifestEntry[] (see src/lib/pdfToImages.ts) — per-page
    // PDF render status/drawing-type hints from the frontend. Raw and
    // UNVALIDATED here; only sanitized (VISION_PAGE_MANIFEST_ENABLED path,
    // below) is it ever used. With the flag off this value is read into a
    // local and never touched again — same "destructure but ignore" shape as
    // every other flagged addition in this file.
    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
    }

    console.log("Chat mode:", mode, "| Language:", language, "| Images:", resolvedImages.length);

    // Service-role client used for quota enforcement and rollback.
    const serviceRoleKey = getSecretKey();
    adminClient = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

    // Per-user durable memory (flag-gated). STARTED here (the call fires
    // immediately), awaited only after the access gate — the read overlaps the
    // entitlement round trips instead of adding serial latency. Keyed strictly
    // by the authenticated userId; empty when off/absent/failed.
    const userMemoryPromise: Promise<string> = userMemoryEnabled()
      ? fetchUserMemory(adminClient, userId)
          .then((v) => { markStage("memory"); return v; })
          .catch(() => "")
      : Promise.resolve("");

    // Building profile (C1c, flag BUILDING_PROFILE_ENABLED). Same shape as the
    // memory read: started before the gate, awaited after it. Scoped to the
    // AUTHENTICATED user AND the conversation id the client sent — the client
    // never sends profile data itself. Empty when off / no valid id / failed.
    const buildingProfilePromise: Promise<string> = (buildingProfileEnabled() && isConversationId(conversation_id))
      ? fetchBuildingProfileBlock(adminClient, conversation_id, userId, language)
          .then((v) => { markStage("profile"); return v; })
          .catch(() => "")
      : Promise.resolve("");

    // ===== ACCESS & LIMIT CHECK (server-side source of truth) =====
    {
      const now            = new Date();

      // Launch-trial constants (must match launch-trial-activate)
      const LAUNCH_DATE_TS  = new Date("2026-03-28T00:00:00.000Z");
      const CAMPAIGN_END_TS = new Date("2026-04-28T00:00:00.000Z");
      const TRIAL_DAYS_NUM  = 7;

      const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];
      const isAdmin      = userEmail && ADMIN_EMAILS.includes(userEmail);

      // The newest-subscription read below is independent of the profile row,
      // so both PostgREST calls are fired together (.then() forces the lazy
      // builder to execute NOW) and each is awaited where needed — saves one
      // serial round trip. supabase-js resolves errors into {error}, never
      // rejects, so the un-awaited promise on the admin/unlimited path is safe.
      const subRowPromise = adminClient
        .from("user_subscriptions")
        .select("status, trial_end, current_period_end, past_due_since, moyasar_card_token, subscription_plans(features, slug)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then((r: any) => r);

      // Fetch profile (fix: use user_id column, not id)
      const { data: profile } = await adminClient
        .from("profiles")
        .select("plan_type, launch_trial_status, launch_trial_start, launch_trial_end, created_at")
        .eq("user_id", userId)
        .maybeSingle();

      const isUnlimitedPlan = profile?.plan_type === "enterprise";
      const isLimitedPaidPlan = profile?.plan_type === "engineer" || profile?.plan_type === "pro";
      console.log("[Limit] email:", userEmail, "| plan_type:", profile?.plan_type, "| isAdmin:", isAdmin, "| isUnlimited:", isUnlimitedPlan, "| isLimitedPaid:", isLimitedPaidPlan);

      if (!isAdmin && !isUnlimitedPlan) {
        // ── Check active paid subscription (fired in parallel above) ─────────
        const { data: sub } = await subRowPromise;

        let dailyLimit       = 10;  // free/expired default
        let hasPaidAccess    = false;
        let isTrialing       = false;
        let planFeatures: any = null;
        let planSlug: string | null = null;
        let isOrgEnterpriseAccess = false; // H6: set below — entitled enterprise seat member
        // H6 follow-up: the trial-card refusal is DEFERRED until after the org
        // seat check below, because an entitled seat member must not be refused
        // for a card their organization already paid in place of.
        let trialCardRequired = false;

        if (sub?.subscription_plans) {
          planFeatures = (sub.subscription_plans as any).features;
          planSlug = (sub.subscription_plans as any).slug;
        }

        if (sub?.status === "trialing" && sub.trial_end && now < new Date(sub.trial_end)) {
          // Billing contract Section 5.1: a card is REQUIRED to start/keep the
          // free trial. The Workspace gate is a UX layer only — without this
          // server check anyone could call this function directly and get the
          // full 7-day trial with no card on file.
          if (!sub.moyasar_card_token) {
            // Deferred, NOT weakened. Returning 403 right here (the previous
            // behaviour) short-circuited the H6 enterprise-seat check below, so
            // a member holding a seat their organization has already paid for
            // was refused because their own legacy trial row never got a card.
            // The refusal is applied a few lines down, once — and only once —
            // the org seat check has had its chance to entitle the caller.
            trialCardRequired = true;
          } else {
            dailyLimit    = 20;
            hasPaidAccess = true;
            isTrialing    = true;
          }
        } else if (sub?.status === "active" && sub.current_period_end && now < new Date(sub.current_period_end)) {
          dailyLimit    = 9999;
          hasPaidAccess = true;
        } else if (sub?.status === "past_due" && sub.past_due_since) {
          const GRACE_DAYS = 7;
          const graceEnd   = new Date(new Date(sub.past_due_since).getTime() + GRACE_DAYS * 86400000);
          if (now < graceEnd) {
            dailyLimit    = 9999;
            hasPaidAccess = true;
          }
        }

        // ── H6: Enterprise org seat entitlement ─────────────────────────────
        // An enterprise seat member (not the owner) has no user_subscriptions
        // row of their own — the ORG's owner holds the per-seat subscription.
        // Without this, a seat member falls through every branch above to
        // dailyLimit=10 (free tier). Mirrors check-subscription's
        // AI_ACCESS_ROLES / org-membership shape (check-subscription/index.ts
        // lines 245, 249) but ADDS a fourth clause check-subscription does
        // NOT have: that the org's linked subscription is actually paying.
        // Nothing in this codebase ever moves organizations.status away from
        // 'active' when the linked subscription lapses (grepped every writer
        // of organizations.status: only moyasar-webhook's org auto-create,
        // which hardcodes status:"active" at insert, and the
        // create_organization_with_owner DB default of 'trial' — no cron or
        // webhook path downgrades it). So org status alone is stale and this
        // subscription check is load-bearing, not defensive belt-and-braces.
        // Only attempted when the caller isn't already fully unlimited via
        // their own subscription — cheap avoidance for the hot path per the
        // brief; adds up to 2 extra round trips (org_members, then
        // user_subscriptions) only for free/trialing/past_due-lapsed callers.
        if (dailyLimit < 9999) {
          const AI_ACCESS_ROLES = ["owner", "admin", "head_of_department", "engineer"];
          const { data: orgMemberRow, error: orgMemberErr } = await adminClient
            .from("org_members")
            .select("role, status, organizations!inner(id, status, subscription_id)")
            .eq("user_id", userId)
            .eq("status", "active")
            .maybeSingle();

          if (orgMemberErr) {
            // R4-MEDIUM-5. `.maybeSingle()` returns PGRST116 when MORE THAN ONE
            // row matches, so a user with an active membership in TWO orgs lands
            // here — not in a real error. The deny is correct and unchanged (we
            // cannot tell which org should fund the seat, and picking one would
            // be guessing about money), but logging it as an infrastructure
            // failure sent an operator hunting a database fault that does not
            // exist. This is the same inversion the renewal job already fixed on
            // its idempotency query. Multi-org entitlement is future work.
            if ((orgMemberErr as any)?.code === "PGRST116") {
              console.warn(
                "[H6] user holds an active membership in more than one organization — " +
                "denying org access because the funding org is ambiguous (data condition, not an error). " +
                `user ${userId}`,
              );
            } else {
              console.error("[H6] org_members lookup failed — denying org access (fail closed):", orgMemberErr.message);
            }
          } else if (orgMemberRow && AI_ACCESS_ROLES.includes(orgMemberRow.role)) {
            const orgData = orgMemberRow.organizations as any;
            const orgStatusOk = orgData?.status === "active" || orgData?.status === "trial";
            if (orgStatusOk && orgData?.subscription_id) {
              const { data: orgSub, error: orgSubErr } = await adminClient
                .from("user_subscriptions")
                .select("status, trial_end, current_period_end, past_due_since, moyasar_card_token")
                .eq("id", orgData.subscription_id)
                .maybeSingle();

              if (orgSubErr) {
                console.error("[H6] org subscription lookup failed — denying org access (fail closed):", orgSubErr.message);
              } else if (orgSub?.status === "active" && orgSub.current_period_end && now < new Date(orgSub.current_period_end)) {
                isOrgEnterpriseAccess = true;
              } else if (orgSub?.status === "trialing" && orgSub.trial_end && now < new Date(orgSub.trial_end) && orgSub.moyasar_card_token) {
                // Billing contract Section 5.1: a trial without a card grants nothing.
                isOrgEnterpriseAccess = true;
              } else if (orgSub?.status === "past_due" && orgSub.past_due_since) {
                const ORG_GRACE_DAYS = 7; // must match GRACE_DAYS everywhere else in this file / check-subscription / moyasar-webhook / process-subscription-renewal
                const orgGraceEnd = new Date(new Date(orgSub.past_due_since).getTime() + ORG_GRACE_DAYS * 86400000);
                if (now < orgGraceEnd) {
                  isOrgEnterpriseAccess = true;
                }
              }
              // orgSub null (dangling FK) or any other status (pending_activation,
              // expired, cancelled) falls through denied — not an error, just unmet.
            }
            // orgData.subscription_id === null: an org exists (e.g. self-service
            // create_organization_with_owner) but has never completed enterprise
            // checkout. Deny — nobody is paying for this org. See report.

            if (isOrgEnterpriseAccess) {
              dailyLimit    = 9999;
              hasPaidAccess = true;
              isTrialing    = false;
              console.log(`[H6] Enterprise org seat access granted — org ${orgData?.id}, role ${orgMemberRow.role}, user ${userId}`);
            }
          }
        }

        // ── Deferred trial-card refusal (billing contract Section 5.1) ────────
        // Unchanged in effect for every caller who is NOT an entitled enterprise
        // seat member: a live trial with no card on file still gets 403 and the
        // server-side card gate still cannot be bypassed by calling this
        // function directly. The ONLY caller this now lets through is one whose
        // organization holds a paying subscription, verified by the clause-4
        // check above.
        if (trialCardRequired && !isOrgEnterpriseAccess) {
          return new Response(
            JSON.stringify({ error: "trial_card_required" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // ── Per-mode enforcement for Engineer/Pro paid plans (not Enterprise) ──
        if (hasPaidAccess && isLimitedPaidPlan && !isTrialing && !isOrgEnterpriseAccess) {
          // primary mode: unlimited, no counter needed
          if (mode === "primary") {
            // pass through without incrementing any counter
          }
          // standard (advisory) mode: check advisory_limit
          else if (mode === "standard") {
            const advisoryLimit = planFeatures?.advisory_limit ?? 20; // default to Engineer limit
            const { data: newCount } = await adminClient.rpc("increment_mode_daily_count", {
              p_user_id: userId,
              p_mode: "standard"
            });
            if (newCount && newCount <= advisoryLimit) {
              recordQuotaIncrement("mode", userId, "standard");
            }
            if (newCount && newCount > advisoryLimit) {
              // Rollback the increment
              await adminClient.rpc("decrement_mode_daily_count", { p_user_id: userId, p_mode: "standard" });
              return new Response(
                JSON.stringify({
                  error: "تجاوزت حد الاستشارات اليومي / Advisory daily limit exceeded",
                  mode: "standard",
                  limit: advisoryLimit
                }),
                { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
          // analysis mode: check analysis_limit
          else if (mode === "analysis") {
            const analysisLimit = planFeatures?.analysis_limit ?? 10; // default to Engineer limit
            const { data: newCount } = await adminClient.rpc("increment_mode_daily_count", {
              p_user_id: userId,
              p_mode: "analysis"
            });
            if (newCount && newCount <= analysisLimit) {
              recordQuotaIncrement("mode", userId, "analysis");
            }
            if (newCount && newCount > analysisLimit) {
              // Rollback the increment
              await adminClient.rpc("decrement_mode_daily_count", { p_user_id: userId, p_mode: "analysis" });
              return new Response(
                JSON.stringify({
                  error: "تجاوزت حد التحليلات اليومي / Analysis daily limit exceeded",
                  mode: "analysis",
                  limit: analysisLimit
                }),
                { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }
        // ── Flat daily limit for trialing users ───────────────────────────────
        else if (hasPaidAccess && isTrialing) {
          if (dailyLimit < 9999) {
            const { data: currentCount } = await adminClient.rpc("increment_daily_usage", { p_user_id: userId });
            if (currentCount && currentCount <= dailyLimit) {
              recordQuotaIncrement("daily", userId);
            }
            if (currentCount && currentCount > dailyLimit) {
              return new Response(
                JSON.stringify({ error: "تجاوزت الحد اليومي للرسائل / Daily message limit exceeded", limit: dailyLimit }),
                { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }
        // ── Launch trial fallback check (users without a user_subscriptions row) ─
        // Statuses must match current DB CHECK constraint (migration 20260328000002).
        // Valid values: trial_active, trial_expired, eligible_existing_pending,
        //               paid, ineligible.  Stale values eligible_new,
        //               eligible_existing_active, ineligible_window_closed removed.
        let launchTrialStatus = profile?.launch_trial_status ?? null;
        // resolvedTrialEnd tracks the authoritative trial end date across all init paths.
        // It is set wherever a trialEnd Date is computed so that trialIsActive can be
        // evaluated even when `profile` is null (no row yet) or when Object.assign was a no-op.
        let resolvedTrialEnd: Date | null = profile?.launch_trial_end ? new Date(profile.launch_trial_end) : null;

        // Auto-initialize if status not yet set (e.g. Google OAuth users whose
        // auto-trial call has not yet run)
        if (!launchTrialStatus) {
          const userCreatedAt = new Date(profile?.created_at ?? now.toISOString());
          const isNewUser     = userCreatedAt >= LAUNCH_DATE_TS;
          if (now < CAMPAIGN_END_TS) {
            if (isNewUser) {
              const trialEnd = new Date(userCreatedAt.getTime() + TRIAL_DAYS_NUM * 86400000);
              launchTrialStatus = "trial_active";
              resolvedTrialEnd  = trialEnd;
              await adminClient.from("profiles").update({
                launch_trial_status:   "trial_active",
                launch_trial_start:    userCreatedAt.toISOString(),
                launch_trial_end:      trialEnd.toISOString(),
                launch_trial_consumed: true,
                launch_source:         "new_signup",
              }).eq("user_id", userId);
              profile && Object.assign(profile, { launch_trial_end: trialEnd.toISOString() });
            } else {
              // First chat activates the trial for existing users
              const trialStart = now;
              const trialEnd   = new Date(now.getTime() + TRIAL_DAYS_NUM * 86400000);
              launchTrialStatus = "trial_active";
              resolvedTrialEnd  = trialEnd;
              await adminClient.from("profiles").update({
                launch_trial_status:   "trial_active",
                launch_trial_start:    trialStart.toISOString(),
                launch_trial_end:      trialEnd.toISOString(),
                launch_trial_consumed: true,
                launch_source:         "existing_user",
              }).eq("user_id", userId);
              profile && Object.assign(profile, { launch_trial_end: trialEnd.toISOString() });
            }
          } else {
            launchTrialStatus = "ineligible";
            await adminClient.from("profiles").update({ launch_trial_status: "ineligible" }).eq("user_id", userId);
          }
        } // end if (!launchTrialStatus)

        // Activate pending existing users on first chat
        if (launchTrialStatus === "eligible_existing_pending") {
          if (now < CAMPAIGN_END_TS) {
            const trialStart = now;
            const trialEnd   = new Date(now.getTime() + TRIAL_DAYS_NUM * 86400000);
            launchTrialStatus = "trial_active";
            resolvedTrialEnd  = trialEnd;
            await adminClient.from("profiles").update({
              launch_trial_status:   "trial_active",
              launch_trial_start:    trialStart.toISOString(),
              launch_trial_end:      trialEnd.toISOString(),
              launch_trial_consumed: true,
            }).eq("user_id", userId);
            profile && Object.assign(profile, { launch_trial_end: trialEnd.toISOString() });
          } else {
            launchTrialStatus = "ineligible";
            await adminClient.from("profiles").update({ launch_trial_status: "ineligible" }).eq("user_id", userId);
          }
        }

        const trialIsActive =
          launchTrialStatus === "trial_active" &&
          resolvedTrialEnd !== null && now < resolvedTrialEnd;

        if (trialIsActive) {
          // Trial users get the same 20-message daily limit as user_subscriptions
          // trialing users. Per-mode limit functions were dropped in migration
          // 20260328000002 and must not be called.
          const trialDailyLimit = 20;
          const { data: currentCount } = await adminClient.rpc("increment_daily_usage", { p_user_id: userId });
          if (currentCount && currentCount <= trialDailyLimit) {
            recordQuotaIncrement("daily", userId);
          }
          if (currentCount && currentCount > trialDailyLimit) {
            return new Response(
              JSON.stringify({
                error: "تجاوزت الحد اليومي للرسائل / Daily message limit exceeded",
                limit: trialDailyLimit,
              }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

        } else if (!hasPaidAccess && !trialIsActive) {
          // ── Mode enforcement — server-side source of truth ─────────────────────
          // Free logged-in users (expired trial, cancelled, expired paid, no sub)
          // may only use primary (main) mode. Advisory (standard) and Analytical
          // (analysis) modes require an active paid subscription or active launch
          // trial. The frontend UI lock is a best-effort UX layer; this check is
          // the authoritative gate that prevents direct API bypasses.
          if (mode === "standard" || mode === "analysis") {
            return new Response(
              JSON.stringify({ error: "mode_locked", mode }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Free daily limit (10 messages / 24h) — applies to all non-paid,
          // non-trial users regardless of why their access lapsed.
          const { data: currentCount } = await adminClient.rpc("increment_daily_usage", { p_user_id: userId });
          if (currentCount && currentCount <= dailyLimit) {
            recordQuotaIncrement("daily", userId);
          }
          if (currentCount && currentCount > dailyLimit) {
            return new Response(
              JSON.stringify({
                error: launchTrialStatus === "trial_expired"
                  ? "trial_expired"
                  : "تجاوزت الحد اليومي للرسائل / Daily message limit exceeded",
                limit: dailyLimit,
              }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }

    markStage("gate");
    // Awaited here, started before the gate — the memory read cost overlaps
    // the entitlement round trips instead of stacking on top of them.
    const userMemoryContent = await userMemoryPromise;
    const buildingProfileContent = await buildingProfilePromise;

    // ── Early stream (wave B, 2026-09-02) ───────────────────────────────────
    // The HTTP response is returned right after the access gate (<1s), and the
    // client watches live thinking_status stage events while retrieval and the
    // model connection do their measured 8-18s of work. Everything from here to
    // the end of the pipeline runs inside earlyPipeline(); failures after this
    // point surface as in-stream {type:"error"} events because the HTTP status
    // is already committed. Sources/engine metadata that used to travel as
    // response headers now travel as the first {type:"sources"} data event
    // (the frontend understands both shapes — it deploys first).
    const earlyTs = new TransformStream<Uint8Array, Uint8Array>();
    const earlyWriter = earlyTs.writable.getWriter();
    const sseEncoder = new TextEncoder();
    let earlyWriterReleased = false;
    const emitEvent = async (obj: unknown) => {
      if (earlyWriterReleased) return;
      try {
        await earlyWriter.write(sseEncoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      } catch { /* client disconnected — the pipeline continues harmlessly */ }
    };
    const emitStatus = (ar: string, en: string) => {
      void emitEvent({ type: "thinking_status", message: language === "en" ? en : ar });
    };
    // Terminal in-stream error: emit the event, then end the stream.
    let upstreamWatchdog: ReturnType<typeof setTimeout> | undefined;
    const failStream = async (errBody: Record<string, unknown>) => {
      if (upstreamWatchdog !== undefined) clearTimeout(upstreamWatchdog);
      await emitEvent({ type: "error", ...errBody });
      try { if (!earlyWriterReleased) await earlyWriter.close(); } catch { /* already closed */ }
    };

    // Upstream watchdog (2026-09-02): the platform kills a request at its
    // wall-clock limit (~150s) and an open stream then simply ENDS — the
    // client gets neither content nor an error (observed live: an analysis
    // request during a provider slowdown died at 154s with 0 chars). If the
    // model has not connected within UPSTREAM_DEADLINE_MS, refund the quota
    // and end the stream with an explicit error event instead.
    const UPSTREAM_DEADLINE_MS = 120_000;
    let upstreamConnected = false;
    let watchdogFired = false;
    upstreamWatchdog = setTimeout(async () => {
      if (upstreamConnected) return;
      watchdogFired = true;
      console.error(`[Pipeline] upstream watchdog fired after ${UPSTREAM_DEADLINE_MS}ms (mode=${mode}) — ending stream with UPSTREAM_TIMEOUT`);
      await rollbackQuotaIfNeeded(adminClient);
      await failStream({
        error: language === "en"
          ? "The service is responding slowly right now. Please try again in a minute."
          : "الخدمة بطيئة في هذه اللحظة. يرجى المحاولة مجدداً بعد دقيقة.",
        error_code: "UPSTREAM_TIMEOUT",
        status: 504,
      });
    }, UPSTREAM_DEADLINE_MS);

    const earlyPipeline = (async () => {
    try {
    if (mode === "primary") {
      emitStatus("✍️ جارٍ إعداد الإجابة...", "✍️ Preparing your answer...");
    } else {
      emitStatus("🔍 جارٍ البحث في كود البناء السعودي...", "🔍 Searching the Saudi Building Code...");
    }

    let fullSystemPrompt: string;
    // ── D2 context caching: the STATIC boundary inside fullSystemPrompt ──────
    // The leading run of bytes that is deterministic for this (mode, language,
    // enabledNewSourceCodes()) and therefore identical on every request until
    // the owner edits a prompt or flips a source-code flag — i.e. the per-mode
    // contract from ./promptContract.ts, plus CITATION_TOKEN_CONTRACT when
    // that is appended directly after it. Everything after this point
    // (retrieved SBC text, structured tables, machine facts, doc uploads,
    // audience layer, format/standards preferences, the user-memory system
    // message, the retry validation prompt) varies per request and is never
    // cached.
    //
    // INVARIANT this whole feature rests on: staticPromptPrefix is always a
    // LEADING SUBSTRING of the assembled fullSystemPrompt — geminiContextCache
    // .buildRequestWithCache slices it off the front of the joined
    // systemInstruction to recover the dynamic remainder. Every assignment
    // below is written to preserve that.
    //
    // "" means "nothing cacheable for this request" (the vision pipeline,
    // whose prompt is assembled by runVisionPipeline around the user's query):
    // ensureContextCache() rejects an empty prefix and returns null, so vision
    // requests are simply never cached. Assigning this variable adds ZERO
    // bytes to fullSystemPrompt — it is only ever READ on the flag-on path.
    let staticPromptPrefix = "";
    let usedFiles: string[] = [];
    let usedSourceMeta: SourcePageMeta[] = [];
    let finalMessages = [...messages];
    // Which retrieval engine actually served this request. Reported as the
    // X-Retrieval-Engine response header (restored 2026-08-23; 587fd5b deleted
    // it). Request-scoped, not module-scoped — one isolate serves concurrent
    // requests. Primary mode loads no documents at all, so it stays "keyword"
    // in the sense of "no vector retrieval happened".
    let retrievalEngine: RetrievalEngine = "keyword";
    // G1 graph expansion (./graphExpansion.ts, wave 2). Non-null only when
    // fetchSBCContextVector actually ran and completed an expansion for this
    // request (flag on, no fail-open fallback) — see VectorRetrievalResult.
    // Reported as the X-Graph-Expansion response header ONLY when non-null,
    // so header-absent is the default for every existing behaviour (flag off,
    // keyword engine, primary mode, or a failed expansion attempt).
    let graphExpansionCount: number | null = null;
    // Why the vector path fell back to keyword, when it did — surfaced as the
    // X-Retrieval-Fallback header ONLY when non-null (vector attempted AND
    // fell back). Stays null when vector succeeded, when the flag is off, and
    // on primary mode, so header-absent is the pre-existing behaviour.
    let retrievalFallbackReason: string | null = null;
    // User-document text blocks AFTER the P2 combined-context clamp. Set only
    // by the STANDARD/ADVISORY TEXT PIPELINE branch below — the only branch
    // whose structured tables + SBC context can stack past the combined cap.
    // Left null by the vision and primary branches, in which case the single
    // shared injection section further down builds the blocks itself exactly
    // as it always did. There is deliberately still only ONE place that emits
    // the document block, so its wrapper text cannot drift between branches.
    let clampedDocBlocks: string[] | null = null;
    // B1a: the retrieved SBC text this request actually put in front of the
    // model, kept at pipeline scope so the post-stream citation verifier can
    // re-derive the per-chunk evidence from it. Only populated when the
    // verifier flag is on; primary mode retrieves nothing and leaves it "".
    const citationVerifierOn = citationVerifierEnabled();
    let retrievedContextForVerifier = "";

    if (resolvedImages.length > 0) {
      // ===== VISION PIPELINE =====
      const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
      const userQuery = lastUserMessage?.content || "";

      // Primary mode with images: use Advisory framing (design guidance) — more appropriate than compliance audit for quick queries
      const visionMode = mode === "primary" ? "standard" : mode;

      // ── P7 (vision page-manifest wiring): VISION_PAGE_MANIFEST_ENABLED ──────
      // Exact string "1", checked once here (Deno.env.get) — the ONLY flag
      // check for this feature; ./visionManifest.ts is a pure module and takes
      // this resolved boolean rather than reading Deno.env itself. With the
      // flag off (default), pageManifestFeatureEnabled is false and
      // sanitizedPageManifests stays [] — runVisionPipeline's manifest
      // parameters below are then no-ops and every prompt it builds is
      // byte-identical to HEAD. sanitizeManifestEntries (see its module header)
      // never throws on its own, but the whole call is still wrapped: the raw
      // `pageManifests` value is client-supplied JSON of unknown shape, and a
      // hostile getter/Proxy on it reading a property could throw before
      // sanitizeManifestEntries' own type checks ever run — fail-open here
      // means that degrades to "no manifest data" rather than failing the
      // whole vision request.
      const pageManifestFeatureEnabled = isVisionPageManifestEnabled(Deno.env.get);
      let sanitizedPageManifests: PageManifestEntry[] = [];
      if (pageManifestFeatureEnabled) {
        try {
          sanitizedPageManifests = sanitizeManifestEntries(pageManifests);
        } catch (manifestErr) {
          console.warn("[VisionManifest] sanitizeManifestEntries failed (fail-open):", manifestErr);
          sanitizedPageManifests = [];
        }
      }

      const { systemPrompt, extraContext, usedFiles: visionFiles, sourceMeta: visionMeta, engine: visionEngine, graphExpansionCount: visionGraphExpansionCount } = await runVisionPipeline(
        GEMINI_API_KEY,
        resolvedImages,
        userQuery,
        language,
        visionMode,
        sanitizedPageManifests,
        pageManifestFeatureEnabled,
      );

      fullSystemPrompt = systemPrompt + extraContext;
      if (citationVerifierOn) retrievedContextForVerifier = extraContext;
      usedFiles = visionFiles;
      usedSourceMeta = visionMeta;
      retrievalEngine = visionEngine;
      graphExpansionCount = visionGraphExpansionCount;

      const lastUserIdx = finalMessages.map((m: any, i: number) => m.role === "user" ? i : -1).filter((i: number) => i >= 0).pop();
      if (lastUserIdx !== undefined && lastUserIdx >= 0) {
        const originalText = finalMessages[lastUserIdx].content;
        finalMessages[lastUserIdx] = {
          role: "user",
          content: [
            ...resolvedImages.map((url: string) => ({ type: "image_url", image_url: { url } })),
            { type: "text", text: originalText || (language === "en" ? "Analyze this drawing." : "حلل هذا المخطط.") },
          ],
        };
      }
    } else if (mode === "primary") {
      // ===== PRIMARY MODE PIPELINE (no document loading, fast) =====
      // MOVED 2026-08-23 to ./promptContract.ts getPrimaryPrompt(). The move
      // dropped the NFPA source claim (primary mode loads NO documents, so it
      // could never have quoted one) and made the [SWITCH:...] markers single-
      // sourced with src/utils/chatRouting.ts.
      fullSystemPrompt = getPrimaryPrompt({ newSourceCodes: enabledNewSourceCodes() });
      // D2 static boundary: primary's whole prompt IS the static contract at
      // this point (nothing has been appended yet).
      staticPromptPrefix = fullSystemPrompt;
      usedFiles = [];
      console.log("Primary mode: using lightweight prompt with escalation rules, no document loading");
    } else {
      // ===== STANDARD/ADVISORY TEXT PIPELINE =====
      const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
      const userQuery = lastUserMessage?.content || "";

      console.log("Fetching SBC context for query:", userQuery.slice(0, 100));

      // ── P6 (reasoning layer): query analysis — BEFORE any retrieval ────────
      // Behind ADVISORY_QUERY_ANALYSIS_ENABLED (exact string "1"). One
      // non-streaming call to gemini-2.5-flash-lite via
      // fetchGeminiNonStreamingWithRetry — the SAME ./geminiResilience.ts
      // machinery callAINonStreaming() (used elsewhere in this file) is built
      // on, called directly here (rather than through callAINonStreaming)
      // because that wrapper hardcodes the gemini-2.5-pro/flash chain and this
      // step needs the fixed, cheaper gemini-2.5-flash-lite model instead. No
      // retry is added beyond what fetchGeminiNonStreamingWithRetry already
      // does on its own.
      //
      // FAIL-OPEN, per task contract: any error, non-OK response, or a parse
      // failure leaves queryFacts null; a hard 8s timeout (Promise.race)
      // guarantees this step can never stall the request past that budget.
      // With the flag off (default) — or on any failure/timeout — queryFacts
      // stays null and every consumer below (embedding enrichment, filter_code
      // preference, the machine-facts prompt block, derivation) behaves
      // exactly as if the flag were OFF. See ./queryAnalysis.ts's module
      // header for what the extracted facts are and are not.
      let queryFacts: QueryFacts | null = null;
      if (isQueryAnalysisEnabled(Deno.env.get)) {
        try {
          const analysisPrompt = buildQueryAnalysisPrompt(userQuery);
          const { systemInstruction: qaSystemInstruction, contents: qaContents } = convertToGeminiFormat([
            { role: "system", content: analysisPrompt },
            { role: "user", content: userQuery },
          ]);
          // gemini-3.1-flash-lite: Google's named successor to the sunset
          // gemini-2.5-flash-lite (key-rotation incident 2026-08-31). This
          // path is flag-off in production and fails open to queryFacts=null,
          // so it was never part of the outage — updated for correctness so it
          // works if ADVISORY_QUERY_ANALYSIS_ENABLED is ever turned on.
          const QUERY_ANALYSIS_MODEL = "gemini-3.1-flash-lite";
          const QUERY_ANALYSIS_TIMEOUT_MS = 8000;

          const call = (async (): Promise<string | null> => {
            try {
              const { response } = await fetchGeminiNonStreamingWithRetry(
                GEMINI_API_KEY,
                QUERY_ANALYSIS_MODEL,
                qaSystemInstruction,
                qaContents,
              );
              if (!response.ok) return null;
              const data = await response.json();
              return (data.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined) ?? null;
            } catch (callErr) {
              // Caught INSIDE the raced promise, not just by the outer
              // try/catch below: if the timeout wins the race first, this
              // promise is never awaited again, so an uncaught rejection here
              // would surface as an unhandled rejection. Converting every
              // failure to `null` keeps `call` a promise that always resolves.
              console.warn("[QueryAnalysis] Model call failed (fail-open):", callErr);
              return null;
            }
          })();
          // The timer handle is kept so the WINNING-call case can cancel it.
          // Without the clearTimeout below, every request that completes the
          // analysis quickly still leaves an 8s timer (and its closure) pending
          // in the isolate long after this block is done — harmless per
          // request, but it is real retained state per request on a long-lived
          // Edge isolate, and "the timeout cancels cleanly" should be true in
          // both directions, not only in the timeout-wins direction.
          // ReturnType<typeof setTimeout>, not `number`: the checker resolves
          // setTimeout to the Node-typed overload here (Timeout), so hardcoding
          // `number` fails type checking.
          let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
          const timeout = new Promise<null>((resolve) => {
            timeoutHandle = setTimeout(() => resolve(null), QUERY_ANALYSIS_TIMEOUT_MS);
          });

          let raw: string | null;
          try {
            raw = await Promise.race([call, timeout]);
          } finally {
            // Safe in both directions: clearing an already-fired timer is a
            // no-op, and the abandoned `call` promise still always resolves
            // (its own internal catch), so nothing is left to reject.
            if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
          }
          if (raw) {
            queryFacts = parseQueryFacts(raw);
          }
        } catch (qaErr) {
          console.warn("[QueryAnalysis] Fail-open, proceeding without facts:", qaErr);
          queryFacts = null;
        }
      }

      // Embedding-only query enrichment (P6 items 2b/3 — never the
      // user-visible message). Starts as userQuery; with the flag(s) off or
      // facts absent this stays reference-unequal but VALUE-identical to
      // userQuery, so fetchSBCContextVector's embedding call below is
      // unchanged. userQuery itself — used for structured tables, the keyword
      // fallback, and finalMessages — is never touched by this.
      let embeddingQueryText = userQuery;
      if (queryFacts && queryFacts.en_search_terms.length > 0) {
        const enrichment = (" " + queryFacts.en_search_terms.join(" ")).slice(0, 300);
        embeddingQueryText += enrichment;
      }

      // ── P6 (reasoning layer): derivation ────────────────────────────────────
      // Behind ADVISORY_QUERY_DERIVATION_ENABLED AND query-analysis facts
      // actually available (facts absent — flag off or extraction failed —
      // leaves derivedSections empty, a no-op below). Appends retrieval-
      // targeting section numbers to the SAME embedding-only text above, never
      // to the prompt (see ./derivationMap.ts's module header: this is a
      // curated retrieval hint, not a citation source). The known-item lookup
      // that would fetch sbc_section_defs rows for these numbers directly is
      // deferred until G0 data exists — this only widens the vector query.
      let derivedSections: DerivedSection[] = [];
      if (isDerivationEnabled(Deno.env.get) && queryFacts) {
        derivedSections = deriveTargetSections({
          occupancy_group: queryFacts.occupancy_group,
          question_type: queryFacts.question_type,
        });
        if (derivedSections.length > 0) {
          embeddingQueryText += " " + derivedSections.map((s) => s.section).join(" ");
        }
      }

      // ── Audience resolution (P6 item 4) ─────────────────────────────────────
      // Gated by its OWN default-OFF flag, ADVISORY_AUDIENCE_LAYER_ENABLED
      // (exact string "1", same semantics as every other flag in this file).
      //
      // The gate is NOT optional polish. The request-level `audience` field and
      // the frontend selector that sends it (src/components/ChatInterface.tsx,
      // src/utils/audiencePref.ts) are both new in this wave, so without a flag
      // a user picking a non-default audience would change the assembled prompt
      // with every env flag off — which is exactly the byte-identity guarantee
      // this wave is required to hold. "No audience selected" happening to be
      // byte-identical is not the same thing as the feature being off.
      //
      // Flag ON: precedence is explicit request `audience` → a valid
      // queryFacts?.audience_hint (only ever set when ADVISORY_QUERY_ANALYSIS_ENABLED
      // is also on AND facts parsed) → "engineer". See ./queryAnalysis.ts's
      // resolveAudience for the full contract. "engineer" resolves here but
      // still appends nothing below.
      //
      // Flag OFF (default): resolvedAudience is forced to "engineer" without
      // consulting either input, so the getAudienceBlock call further down is
      // never reached and this branch is byte-identical to HEAD.
      const audienceLayerEnabled = Deno.env.get("ADVISORY_AUDIENCE_LAYER_ENABLED") === "1";
      const resolvedAudience = audienceLayerEnabled
        ? resolveAudience(audience, queryFacts?.audience_hint)
        : "engineer";

      // ── 1. Structured Table Path (DB transcription layer, injected first) ──
      // If the query references a known SBC table ID, fetch its stored row from
      // sbc_code_tables before running any storage/vector retrieval. Injected
      // first for visibility, NOT for authority — the rows are an unverified
      // transcription layer and the injected block says so. See the provenance
      // warning above fetchStructuredTables.
      const supabaseAdminForTables = createClient(
        Deno.env.get("SUPABASE_URL")!,
        getSecretKey(),
      );
      const { context: structuredTableContext, matchedTableIds, matchedTables } =
        await fetchStructuredTables(userQuery, supabaseAdminForTables);

      if (matchedTableIds.length > 0) {
        console.log(`[StructuredTable] Matched and injected tables: ${matchedTableIds.join(", ")}`);
      }

      // P5 flagless truth fix (unconditional — sanctioned as the one
      // flagless change in this task). fetchStructuredTables() already
      // injects matched sbc_code_tables rows into the PROMPT above, but that
      // provenance never reached the client: X-SBC-Sources /
      // X-SBC-Source-Meta only ever carried PDF-chunk filenames. This builds
      // the `__sbc_table__::SBC-XXX::<table_id>` sentinel
      // src/utils/sourceMetadata.ts's resolveSourceMeta() (~116-141) already
      // parses, so structured-table evidence shows up in SourcePanel like
      // any other source. Empty input -> empty output, so when no table
      // matched this changes nothing; when one did, it ONLY adds header
      // entries below (usedFiles/usedSourceMeta) — the assembled PROMPT
      // bytes are untouched (structuredTableContext / fullSystemPrompt are
      // not read or written here).
      const { files: tableSourceFiles, sourceMeta: tableSourceMeta } =
        buildTableSourceSignals(matchedTables);

      // P5: single read of the citation-tokens flag, shared by the
      // CITATION_TOKEN_CONTRACT append (step 3 below) and the
      // sbc_external_refs honesty block (also step 3) — "the same flag" per
      // task spec. Exact-string "1" only; unset/""/"0"/anything else is OFF,
      // matching every other flag in this file (see ADVISORY_VECTOR_*_ENABLED
      // in ./retrievalPolicy.ts).
      const citationTokensEnabled = Deno.env.get("ADVISORY_CITATION_TOKENS_ENABLED") === "1";

      // ── 2. Document retrieval (always runs; supplements structured tables) ──
      //
      // CORRECTED 2026-08-23. The comment that used to sit here read:
      //   "Use keyword/storage path directly — vector RPC
      //    (match_sbc_documents) is not provisioned"
      // That was FALSE and it is what kept the advisory path on keyword search.
      // Verified directly against production on 2026-08-23:
      //   - match_sbc_documents EXISTS in pg_proc, with identity arguments
      //     (query_embedding vector, match_count integer, filter_code text);
      //   - sbc_documents holds 4,630 rows of which 4,594 carry an embedding
      //     (2,775 SBC201 / 1,855 SBC801; the 36 nulls are all SBC201).
      // The RPC is provisioned and the data is there. What is actually true is
      // that the vector path is not TRUSTED yet, which is a different claim and
      // is why it sits behind a reversible, default-OFF flag rather than behind
      // a false statement about the database:
      //   - ADVISORY_VECTOR_RETRIEVAL_ENABLED must be exactly "1" to enable it;
      //   - unset / "" / "0" / "true" all mean OFF, and with it OFF this branch
      //     calls fetchSBCContext exactly as before — no behaviour change;
      //   - no head-to-head vector-vs-keyword benchmark has been run against
      //     real query embeddings yet, so there is no measurement that would
      //     justify turning it on. See
      //     docs/audits/advisory-vector-bench-20260823.md.
      // Turning it back off is an env-var change, not a deploy.
      const useVector = shouldUseVectorForAdvisory(mode, Deno.env.get);
      let sbcContext: string;
      let files: string[];
      let keywordMeta: SourcePageMeta[];
      // P5: sbc_documents.id list feeding the sbc_external_refs honesty-block
      // lookup below. Per task spec, "vector path has ids; keyword path
      // skip" — the keyword/storage path (fetchSBCContext) has no doc-row
      // ids to resolve, so it stays [] rather than being taught a new
      // concept it never had.
      let retrievedDocIds: number[] = [];
      if (useVector) {
        // Pass the ACTUAL request mode, not a hardcoded "standard" literal.
        // matchCount inside this function is `mode === 'primary' ? 10 : 25`
        // (see its definition above), and this branch only runs when mode is
        // already NOT "primary" (that case is handled earlier), so mode here is
        // "standard" or "analysis" — both resolve to the same 25-match profile.
        // The result: when shouldUseVectorForAdvisory has let an analysis text
        // request through (both flags ON), it gets the same retrieval depth as
        // standard, not a smaller one by accident. The unrelated 10-match value
        // at the image/vision call site above (which passes a literal, not the
        // request mode) is an image-token-budget artifact of that separate call
        // site — it is deliberately left unchanged.
        // P6: reasoningHints carries the embedding-only enrichment and the
        // code_hint filter_code preference computed above. Both default back
        // to fetchSBCContextVector's own regex/`query` behaviour when absent
        // (flag off or facts did not parse) — see VectorReasoningHints.
        //
        // D1: the ONE retrieval this request performs, optionally served from
        // the two-layer cache (./retrievalCache.ts) behind RETRIEVAL_CACHE_ENABLED.
        // With the flag off, retrievalCacheEnabled() is one synchronous env
        // read and the else-branch below awaits exactly the call that stood
        // here before — same arguments, same closure, no extra round trip.
        const runVectorRetrieval = () => fetchSBCContextVector(userQuery, mode, undefined, {
          embeddingQuery: embeddingQueryText,
          codeHint: queryFacts?.code_hint,
        });
        let vec: VectorRetrievalResult;
        if (retrievalCacheEnabled()) {
          const cacheCodes = queryFacts?.code_hint
            ? [queryFacts.code_hint]
            : [detectFilterCodeFor(userQuery, enabledNewSourceCodes())].filter(
                (c): c is string => c !== null,
              );
          try {
            vec = await getRetrievalCached(
              adminClient,
              await buildRetrievalCacheKeyParts(adminClient, embeddingQueryText, cacheCodes, mode),
              RETRIEVAL_CACHE_TTL_SECONDS,
              async () => {
                const fresh = await runVectorRetrieval();
                // Only a real retrieval result is cacheable; every fallback
                // leaves through the throw so nothing is written.
                if (fresh.engine === "keyword") throw new UncachedRetrievalFallback(fresh);
                return fresh;
              },
            );
          } catch (cacheErr) {
            if (cacheErr instanceof UncachedRetrievalFallback) vec = cacheErr.result;
            else throw cacheErr;
          }
        } else {
          vec = await runVectorRetrieval();
        }
        sbcContext = vec.context;
        files = vec.files;
        keywordMeta = vec.sourceMeta;
        retrievalEngine = vec.engine;
        retrievedDocIds = vec.docIds;
        graphExpansionCount = vec.graphExpansionCount;
        retrievalFallbackReason = vec.fallbackReason;
      } else {
        const kw = await fetchSBCContext(userQuery);
        sbcContext = kw.context;
        files = kw.files;
        keywordMeta = kw.sourceMeta;
        retrievalEngine = "keyword";
      }
      // P5 flagless truth fix: append the structured-table sentinel entries
      // built above (empty arrays when no table matched, so this is a no-op
      // then). This is the only line that changes X-SBC-Sources /
      // X-SBC-Source-Meta for structured-table matches — everything else in
      // this branch is unchanged.
      usedFiles = [...files, ...tableSourceFiles];
      usedSourceMeta = [...keywordMeta, ...tableSourceMeta];
      markStage(`retrieval(${retrievalEngine})`);
      console.log(`SBC context result: ${sbcContext.length} chars from ${usedFiles.length} files [engine=${retrievalEngine}]`);
      if (usedFiles.length > 0) {
        emitStatus(
          `📚 وجدت ${usedFiles.length} من مصادر الكود — جارٍ إعداد إجابة موثقة...`,
          `📚 Found ${usedFiles.length} code sources — preparing a documented answer...`,
        );
      }

      // ── P5-R4: External-standard honesty block (flag-gated, fail-open) ──────
      // The retrieved SBC text routinely cites external standards (NFPA/ASTM/
      // UL/...) ConsultX does not hold. When citationTokensEnabled and the
      // vector path resolved doc rows, look up public.sbc_external_refs
      // (supabase/migrations/20260824100005_sbc_external_refs.sql) for those
      // rows via the SAME service client already created above
      // (supabaseAdminForTables) and, if any citations exist, build a short
      // labelled block to append after the retrieved text below.
      //
      // FAIL-OPEN IS THE CONTRACT, NOT DEFENSIVE POLISH: that table DOES NOT
      // EXIST IN PRODUCTION YET. Any error — missing table (42P01), network,
      // anything else — or a zero-row result must leave externalRefsBlock ""
      // and therefore leave fullSystemPrompt exactly as it would be with the
      // flag OFF.
      let externalRefsBlock = "";
      if (citationTokensEnabled && retrievedDocIds.length > 0) {
        try {
          // Ordered, not just filtered. formatExternalRefsBlock caps the block
          // at 5 distinct references, so WHICH 5 survive depends on row order —
          // and PostgREST gives no order guarantee without an explicit sort.
          // Unordered, two byte-identical repeat requests could assemble
          // different prompts, which is the same reproducibility defect the
          // deterministic (embedding, id ASC) tie-break in
          // 20260824100001_match_sbc_documents_v2.sql exists to prevent. Sorting
          // by standard_ref then standard makes the selected 5 a pure function
          // of the retrieved doc set. Both columns are covered by
          // idx_sbc_external_refs_doc's filter, so this is a sort of an already
          // tiny row set. If the ORDER is ever rejected the query returns an
          // error and the fail-open path below leaves the block "" — same as
          // flag OFF.
          const { data: extRefRows, error: extRefError } = await supabaseAdminForTables
            .from("sbc_external_refs")
            .select("standard, standard_ref")
            .in("doc_id", retrievedDocIds)
            .order("standard_ref", { ascending: true, nullsFirst: false })
            .order("standard", { ascending: true });
          if (!extRefError && extRefRows && extRefRows.length > 0) {
            externalRefsBlock = formatExternalRefsBlock(extRefRows as ExternalRefRow[]);
          }
        } catch (extRefFatalErr) {
          console.warn("[ExternalRefs] Lookup failed (fail-open, no block appended):", extRefFatalErr);
          externalRefsBlock = "";
        }
      }

      // ── 3. Assemble final system prompt ──────────────────────────────────────
      const basePrompt = mode === "analysis"
        ? getAnalysisPrompt(language, { newSourceCodes: enabledNewSourceCodes() })
        : getStandardPrompt(language, { newSourceCodes: enabledNewSourceCodes() });

      fullSystemPrompt = basePrompt;
      // D2 static boundary: the per-mode contract. Extended by
      // CITATION_TOKEN_CONTRACT a few lines below, but ONLY when nothing
      // per-request was appended in between (see there).
      staticPromptPrefix = basePrompt;

      // P6: machine-extracted query facts, appended immediately AFTER the
      // base prompt (labelled block — see MACHINE_FACTS_LABEL) so it sits
      // right next to the diagnostic protocol's Step 1 that base prompt
      // defines. Only when the flag is on AND facts actually parsed;
      // otherwise fullSystemPrompt stays byte-identical to basePrompt at this
      // point. buildMachineFactsBlock's own wording is declarative-only and
      // explicitly does not bypass the clarify-first gate — see
      // ./queryAnalysis.ts's module header.
      if (queryFacts) {
        fullSystemPrompt += "\n\n" + buildMachineFactsBlock(queryFacts);
      }

      // P5: inline citation-token contract (flag-gated, standard/analysis
      // text requests only — never primary, never vision, matching task
      // spec exactly: this whole branch IS the standard/analysis text
      // pipeline). See promptContract.ts's CITATION_TOKEN_CONTRACT header:
      // index.ts is documented there as the only place allowed to append it,
      // gated on the exact string "1". OFF/absent (default) leaves
      // fullSystemPrompt byte-identical to basePrompt at this point — no
      // behaviour change versus HEAD.
      if (citationTokensEnabled) {
        fullSystemPrompt += CITATION_TOKEN_CONTRACT;
      }
      // D2 static boundary, extension. CITATION_TOKEN_CONTRACT is a constant
      // (deterministic for a given flag state), so it belongs to the cacheable
      // prefix — but only when it landed DIRECTLY after basePrompt. When
      // queryFacts inserted a per-request block between them, the prefix has
      // to stop at basePrompt or it would no longer be a leading substring of
      // fullSystemPrompt. This is a pure bookkeeping line: it appends nothing
      // to what the model receives.
      if (citationTokensEnabled && !queryFacts) {
        staticPromptPrefix += CITATION_TOKEN_CONTRACT;
      }

      // sbcWarningMsg / the 503 decision are evaluated on the RAW retrieval
      // results, before any context-budget clamping below — they are about
      // whether retrieval found anything at all, not about how much of it fits.
      let sbcWarningMsg = "";
      if (sbcContext) {
        sbcWarningMsg = language === "en"
          ? `\n\n⚠️ CRITICAL: Cite exact clause numbers from above. If not found, say: "The required information is not available in the current files."`
          : `\n\n⚠️ هام: استشهد بأرقام المواد الدقيقة من المستندات أعلاه. إذا لم تجد، قل: "المعلومات المطلوبة غير متوفرة في الملفات الحالية."`;
      } else if (!structuredTableContext) {
        // No SBC content loaded at all (neither structured tables nor storage chunks).
        // Return a clean 503 instead of calling Gemini with no context (which produces
        // misleading "text not available in provided files" responses).
        console.error("SBC context empty after retrieval — failing the stream (would have been 503)");
        const errMsg = language === "en"
          ? "Reference documents are temporarily unavailable. Please try again in a moment."
          : "المستندات المرجعية غير متوفرة مؤقتاً. يرجى المحاولة مجدداً بعد لحظات.";
        await failStream({ error: errMsg, error_code: "SBC_CONTEXT_EMPTY", status: 503 });
        return;
      }
      // If only structuredTableContext loaded (storage failed), we still proceed.
      // NOT because the stored row is sufficient — it is an unverified
      // transcription (see the provenance warning above fetchStructuredTables) —
      // but because its injected block instructs the model to label the values
      // unverified, apply the unsprinklered-vs-sprinklered sanity gate, and refuse
      // to answer from a row that fails it. Behaviour deliberately unchanged here;
      // whether this branch should instead 503 is an owner decision, not a
      // comment-level one.
      
      // ── Context budget clamp (P2) ────────────────────────────────────────────
      // structuredTableContext + sbcContext + the user-document blocks can
      // stack past TOTAL_CONTEXT_CAP: each piece is capped on its own
      // (sbcContext at MAX_TOTAL_CONTEXT inside retrieval, each doc block at
      // 8,000 chars) but nothing capped their SUM, and the vector path's
      // 25-match retrieval widens that surface further. clampAssembledContext
      // enforces the combined cap deterministically: tableBlock is never
      // touched, docBlocks are dropped/truncated from the end first, sbcContext
      // only after that.
      //
      // The cap is applied ONLY on the flag-gated vector path. On the keyword
      // path an infinite cap is passed, which makes clampAssembledContext an
      // exact identity pass-through (its first branch returns the inputs
      // unchanged, same string values and same array reference). That is what
      // keeps flag-OFF behaviour byte-identical to HEAD at ANY size rather than
      // only when the total happens to fit: with the flag off this branch
      // cannot truncate anything HEAD would have sent. Whether the keyword path
      // should also be capped is a separate, pre-existing question and is not
      // silently answered here.
      //
      // The doc blocks are built here (rather than only in the shared injection
      // section further down) solely so they can be weighed against the same
      // budget; each still carries its own unchanged 8,000-char per-file
      // truncation.
      const clamped = clampAssembledContext(
        {
          tableBlock: structuredTableContext || "",
          sbcContext: sbcContext || "",
          docBlocks: buildDocTextBlocks(resolvedDocTexts),
        },
        useVector ? TOTAL_CONTEXT_CAP : Number.POSITIVE_INFINITY,
      );
      if (clamped.truncated) {
        console.warn(
          `[ContextBudget] Assembled context exceeded ${TOTAL_CONTEXT_CAP} chars — ` +
          `clamped to ${clamped.totalChars} chars (dropped ${clamped.droppedDocBlocks} doc block(s))`
        );
      }
      clampedDocBlocks = clamped.docBlocks;
      // B1a: verify against the CLAMPED text — the evidence the model actually
      // saw. Anything the budget dropped was never in front of it, so a token
      // resting on dropped text is correctly reported as unverified.
      if (citationVerifierOn) retrievedContextForVerifier = clamped.sbcContext || "";

      // Structured table context is injected FIRST for visibility. It is NOT the
      // higher-trust source: its own block instructs the model that retrieved SBC
      // document text (appended below) overrides it on any conflict.
      if (clamped.tableBlock) {
        fullSystemPrompt += clamped.tableBlock;
      }

      if (sbcContext) {
        fullSystemPrompt += clamped.sbcContext;
        fullSystemPrompt += sbcWarningMsg;
        // P5-R4: external-standard honesty block, appended AFTER the
        // retrieved text per task spec. "" (flag OFF, no doc ids, lookup
        // failed/table missing, or zero rows) is always safe to append.
        if (externalRefsBlock) {
          fullSystemPrompt += externalRefsBlock;
        }
      }

      // P6 item 4: audience presentation layer. Appended when (and only when)
      // resolvedAudience computed above is not "engineer". With
      // ADVISORY_AUDIENCE_LAYER_ENABLED off (default) resolvedAudience is
      // hard-forced to "engineer" at its declaration above, so this block is
      // unreachable and fullSystemPrompt stays byte-identical to HEAD no matter
      // what the client sends. With the flag on, "engineer" and "absent" both
      // resolve to "engineer" and still append nothing here.
      // getAudienceBlock's own AudienceRole type excludes "engineer"; this
      // guard is what makes that call safe.
      // Standard/analysis text requests only — this line lives inside that
      // branch, never in the vision or primary branches.
      if (resolvedAudience !== "engineer") {
        fullSystemPrompt += "\n\n" + getAudienceBlock(resolvedAudience, language);
      }

      // Final binding reminder: diagnostic protocol takes precedence over reference context
      const finalBindingReminder = language === "en"
        ? `\n\n🔒 FINAL INSTRUCTION: The reference text above is for grounding only. It does NOT mean the user inputs are sufficient. If critical variables (occupancy, height, area) are missing, you MUST stop and ask 1–3 clarifying questions first. Do not produce a final A-F answer until inputs are sufficient. Do not assume missing variables.`
        : `\n\n🔒 تعليمة نهائية ملزمة: النص المرجعي أعلاه للتثبيت فقط ولا يعني أن معطيات المستخدم كافية. إذا كانت المعطيات الحرجة (التصنيف، الارتفاع، المساحة) ناقصة، يجب عليك التوقف فوراً وطرح 1 إلى 3 أسئلة توضيحية. ممنوع تقديم إجابة نهائية (A-F) قبل اكتمال المعطيات. ممنوع افتراض المتغيرات الناقصة.`;
      fullSystemPrompt += finalBindingReminder;
    }
    
    // ── Inject document texts (CSV/TXT files) into system prompt ─────────────
    // These are structured text documents uploaded by the user (schedules, tables,
    // specifications). Injected AFTER the SBC context so they appear as user-provided
    // project data, clearly distinct from code references.
    if (resolvedDocTexts.length > 0) {
      // Prefer the budget-clamped blocks when the standard/advisory text branch
      // produced them; the vision and primary branches never clamp, so they
      // build the same blocks here from the same helper — identical output.
      const docBlocks = clampedDocBlocks ?? buildDocTextBlocks(resolvedDocTexts);
      let docTextBlock = language === "en"
        ? `\n\n=== USER-PROVIDED DOCUMENTS (Text/CSV/Schedule Files) ===\n`
        : `\n\n=== وثائق المستخدم المرفوعة (ملفات نصية / CSV / جداول) ===\n`;
      docTextBlock += docBlocks.join("");
      docTextBlock += language === "en"
        ? `\n=== END USER-PROVIDED DOCUMENTS ===\nNOTE: The above documents are user-supplied project data (schedules, specifications, material lists). Treat them as CONFIRMED project inputs. Reference them explicitly when analyzing compliance. Do not confuse them with code references.\n`
        : `\n=== نهاية وثائق المستخدم ===\nملاحظة: الوثائق أعلاه بيانات مشروع مرفوعة من المستخدم (جداول، مواصفات، قوائم مواد). اعتبرها مدخلات مشروع مؤكدة. أشر إليها صراحة عند تحليل الامتثال. لا تخلطها مع مراجع الكود.\n`;
      fullSystemPrompt += docTextBlock;
      console.log(`[DocText] Injected ${docBlocks.length} of ${resolvedDocTexts.length} document(s) into prompt`);
    }

    // ── Apply user preferences to system prompt ────────────────────────────
    // output_format and preferred_standards come from the user's saved settings
    // (profiles table). They are forwarded by the frontend with every request.

    // output_format: adjust response style/length
    if (output_format && output_format !== "detailed") {
      const formatInstruction = output_format === "concise"
        ? (language === "en"
          ? "\n\n📏 FORMAT PREFERENCE: The user has requested CONCISE responses. Keep answers brief and direct. Avoid lengthy explanations. Use bullet points over prose where possible. Target under 300 words unless a code section requires verbatim quoting."
          : "\n\n📏 تفضيل التنسيق: المستخدم طلب إجابات موجزة. أبقِ إجاباتك قصيرة ومباشرة. استخدم النقاط بدل الفقرات الطويلة كلما أمكن. هدف أقل من 300 كلمة ما لم يتطلب نص الكود اقتباساً حرفياً.")
        : (language === "en"
          ? "\n\n📄 FORMAT PREFERENCE: The user has requested a REPORT format. Structure your response as a formal engineering report with clear numbered sections, headers, a summary table if applicable, and a final verdict section. Use professional report language."
          : "\n\n📄 تفضيل التنسيق: المستخدم طلب صيغة تقرير رسمي. نظّم إجابتك كتقرير هندسي رسمي بأقسام مرقمة وعناوين واضحة وجدول ملخص إن أمكن وقسم حكم نهائي. استخدم لغة تقارير مهنية.");
      fullSystemPrompt += formatInstruction;
    }

    // preferred_standards: signal which SBC document the user wants prioritised
    if (Array.isArray(preferred_standards) && preferred_standards.length > 0 && preferred_standards.length < 2) {
      // Only apply when user has narrowed to a specific standard (not the default "both")
      const stdNote = preferred_standards[0];
      const stdInstruction = language === "en"
        ? `\n\n📌 STANDARDS PREFERENCE: The user has set "${stdNote}" as their preferred standard. When both SBC 201 and SBC 801 are relevant, cite ${stdNote} first and give it primary prominence in your answer. Still cross-reference the other standard when required by code.`
        : `\n\n📌 تفضيل المعيار: المستخدم حدد "${stdNote}" كمعياره المفضّل. عندما يكون كلا المعيارين SBC 201 وSBC 801 ذوي صلة، اذكر ${stdNote} أولاً وامنحه الأولوية في إجابتك. مع الإشارة إلى المعيار الآخر عند اشتراط الكود ذلك.`;
      fullSystemPrompt += stdInstruction;
    }

    const systemMessages: any[] = [{ role: "system", content: fullSystemPrompt }];
    if (userMemoryContent) {
      // Personalisation context only — explicitly NOT a code source, so the
      // citation contract (retrieved-text-only) is unaffected.
      systemMessages.push({
        role: "system",
        content:
          `═══ ذاكرة الحساب (حقائق محفوظة من محادثات سابقة لهذا المستخدم) ═══\n` +
          `${userMemoryContent}\n` +
          `استخدم هذه المعلومات لتخصيص الإجابة (مخاطبة المستخدم باسمه، وربط الإجابة بمشاريعه عند الصلة). ` +
          `هذه معلومات خلفية عن المستخدم فقط — ليست مصدراً كودياً ولا تُستشهد بها.`,
      });
    }
    if (buildingProfileContent) {
      // User-provided building facts (C1c). Its own system block, after the
      // memory block and before the retry prompt: context for computing the
      // answer and explicitly NOT a code source (the block header says so).
      // Appended AFTER fullSystemPrompt, so the context-cache invariant
      // (staticPromptPrefix is a leading substring) is untouched.
      systemMessages.push({ role: "system", content: buildingProfileContent });
    }
    if (retry) {
      systemMessages.push({ role: "system", content: getValidationPrompt(mode, language) });
    }

    // Model selection (updated 2026-08-31, key-rotation incident):
    // Primary → gemini-3.6-flash (fast/cheap), Standard/Analysis →
    // gemini-3.1-pro-preview (reasoning), both falling back to 3.6-flash then
    // down the candidate chain. buildModelChain only keeps models the key's
    // own catalog lists, so a key still on 2.5 skips these and lands on the
    // 2.5 fallbacks below in GEMINI_MODEL_CANDIDATES. Leading with GA models
    // means the common case succeeds on the FIRST call — no wasted 404s.
    const preferredModel = mode === "primary" ? "gemini-3.6-flash" : "gemini-3.7-flash";
    const fallbackModel = "gemini-3.6-flash";

    const { systemInstruction, contents } = convertToGeminiFormat([
      ...systemMessages,
      ...finalMessages,
    ]);

    console.log(`[Gemini] Mode: ${mode} | Messages: ${contents.length} | API Key exists: ${!!GEMINI_API_KEY}`);

    const availableModels = await fetchAvailableGeminiModels(GEMINI_API_KEY);
    markStage("models");
    const modelChain = buildModelChain(preferredModel, fallbackModel, availableModels);
    console.log(`[Gemini] Streaming model chain: ${modelChain.join(" -> ")}`);
    if (mode === "analysis") {
      emitStatus(
        "🧠 جارٍ التحليل المعمق — الأسئلة المركبة قد تستغرق حتى دقيقة...",
        "🧠 Deep analysis in progress — complex questions can take up to a minute...",
      );
    } else if (mode === "standard") {
      emitStatus(
        "🧠 جارٍ صياغة الاستشارة الموثقة...",
        "🧠 Composing the documented advisory answer...",
      );
    }

    let geminiModel = preferredModel;
    let response: Response | null = null;
    let lastErrorText = "";
    let lastStatus = 0;
    const chainFailures: Array<{ status: number; errorText: string }> = [];

    // ── D2 context caching (GEMINI_CONTEXT_CACHE_ENABLED, exact "1") ─────────
    // Read ONCE here — the single flag check for this feature in index.ts.
    // False (default, and for any value other than "1") means the loop below
    // never awaits ensureContextCache, never marks the context_cache stage and
    // passes null to fetchGeminiStreamWithRetry, whose cached branches are then
    // all dead: the request body is the same object literal in the same
    // property order as before this change. isContextCacheEnabled is imported
    // rather than re-derived inline so the exact-"1" rule has one owner.
    const contextCacheOn = isContextCacheEnabled(Deno.env.get);

    for (const model of modelChain) {
      geminiModel = model;
      // The cache object is per (model, mode, static-prefix hash), so it is
      // resolved inside the chain loop: falling back to the next model must
      // not reuse the previous model's cache (Gemini binds a cachedContents
      // object to one model). Fail-open — ensureContextCache never throws and
      // returns null on any problem, which is exactly the flag-off path.
      let cacheRef: ContextCacheRef | null = null;
      if (contextCacheOn) {
        // v2 (2026-09-03), after the first gate FAILED — the create used to be
        // awaited HERE, so every registry miss paid 0.4-2.7s of cachedContents
        // POST on the critical path and the request that paid it still went
        // out uncached. Now: a registry HIT (local, no network) is used; a
        // MISS fires the create in the background for the NEXT request and
        // this one proceeds exactly as it would with the flag off. The create
        // is deliberately NOT awaited — the response stream stays open for
        // seconds afterwards, which is ample for it to land, and if the
        // isolate is torn down first the next request simply tries again.
        // ensureContextCache dedupes concurrent creates per isolate, so
        // firing it from several in-flight requests costs one object, not N.
        cacheRef = await lookupContextCache(model, mode, staticPromptPrefix, Deno.env.get);
        if (!cacheRef) {
          // Through scheduleBackground (EdgeRuntime.waitUntil), NOT a bare
          // floating promise: measured 2026-09-03, a fire-and-forget create
          // never survived — two probe rounds seconds apart both reported
          // cache_miss because the runtime tears down pending work when the
          // response ends. This is the same mechanism the user-memory update
          // uses, and the create is fail-open, so a torn-down isolate simply
          // means the next request tries again.
          scheduleBackground(
            ensureContextCache(
              GEMINI_API_KEY,
              model,
              mode,
              staticPromptPrefix,
              Deno.env.get,
              DEFAULT_CONTEXT_CACHE_TTL_SECONDS,
            ).catch(() => {}),
          );
        }
        // The outcome is now a TIMED STAGE, not just a log line: the previous
        // gate could not tell a hit from a create because function_logs lag by
        // more than the measurement window, while X-Timing comes back on the
        // response itself. cache_hit / cache_miss, never both.
        console.log(
          `[ContextCache] mode=${mode} ${cacheRef ? "hit" : "miss->background create"} model=${model} ` +
          `prefix=${staticPromptPrefix.length}ch name=${cacheRef?.cachedContent ?? "none"} stats=${JSON.stringify(contextCacheStats())}`,
        );
        markStage(cacheRef ? "cache_hit" : "cache_miss");
      }
      // Primary is the latency-sensitive general mode (no retrieval context):
      // minimal thinking cuts many seconds off the first byte. Advisory and
      // analysis keep the model's default (reasoning-heavy) behaviour.
      const result = await fetchGeminiStreamWithRetry(
        GEMINI_API_KEY, model, systemInstruction, contents, 3,
        // D2 session 6 (2026-09-03): the thinking level is now per mode and
        // env-tunable, so the heavy modes can be measured at intermediate
        // levels instead of only "capped" (primary) vs "uncapped" (the rest).
        // Defaults reproduce today's behaviour exactly — primary minimal,
        // standard/analysis model-default — so an unset or mistyped variable
        // changes nothing. Measurement: gemini_connect in X-Timing per mode.
        resolveThinkingEffort(
          Deno.env.get,
          mode === "primary"
            ? "THINKING_EFFORT_PRIMARY"
            : mode === "analysis"
              ? "THINKING_EFFORT_ANALYSIS"
              : "THINKING_EFFORT_STANDARD",
          mode === "primary" ? "minimal" : "default",
        ),
        cacheRef ? { ref: cacheRef, mode } : null,
      );
      if (result.response.ok) {
        response = result.response;
        break;
      }
      lastErrorText = result.errorText;
      lastStatus = result.response.status;
      // Every failure is kept, not just the last one: the chain ends on the
      // oldest fallback models, which answer 404 "no longer available" for a
      // key on a new project, so classifying by the LAST error reports a
      // missing-model problem when the real cause (an account block, a rate
      // limit) hit every model. Measured during the 2026-09-03 outage.
      chainFailures.push({ status: result.response.status, errorText: result.errorText });
      console.error(`[Gemini] ${model} failed: ${result.response.status} | ${result.errorText.slice(0, 300)}`);
    }

    if (!response || !response.ok) {
      await rollbackQuotaIfNeeded(adminClient);
      const classified = classifyGeminiChainFailure(chainFailures);
      console.error(
        `[Gemini] All models exhausted (${chainFailures.length} attempts: ` +
        `${chainFailures.map((f) => f.status).join(", ")}) | ${classified.logSafe}`,
      );
      const userMessage = language === "en" ? classified.userMessage : classified.userMessageAr;
      await failStream({
        error: userMessage,
        error_code: classified.classification,
        provider: "gemini",
        status: classified.status,
      });
      return;
    }

    console.log(`[Gemini] Streaming response started | Model: ${geminiModel}`);
    upstreamConnected = true;
    if (upstreamWatchdog !== undefined) clearTimeout(upstreamWatchdog);
    if (watchdogFired) {
      // The watchdog already ended the stream — nothing to pipe into.
      console.error("[Pipeline] model connected after the watchdog ended the stream; discarding");
      return;
    }
    markStage("gemini_connect");
    console.log(`[Timing] mode=${mode} | ${stageLog.join(" | ")} | first-byte-path total=+${Date.now() - reqStart}ms`);
    clearQuotaIncrement();

    // Memory update runs AFTER the response is on the wire (zero added
    // latency); keyed by the authenticated userId only.
    if (userMemoryEnabled()) {
      const latestUserMsg = Array.isArray(messages)
        ? ([...messages].reverse().find((m: any) => m?.role === "user")?.content ?? "")
        : "";
      const g = globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } };
      console.log(`[Memory] scheduling update | user=${userId} | msgLen=${String(latestUserMsg).length} | waitUntil=${typeof g.EdgeRuntime?.waitUntil}`);
      scheduleBackground(
        updateUserMemoryInBackground(adminClient, GEMINI_API_KEY, userId, userMemoryContent, String(latestUserMsg)),
      );
    }

    // Transform Gemini SSE → OpenAI SSE format (keeps Frontend unchanged)
    // lineBuffer carries incomplete SSE lines across Deno chunk boundaries so that
    // a data: {...} line split across two chunks is fully assembled before JSON.parse.
    let lineBuffer = "";
    // B1a: with the verifier on, the answer text is accumulated here so it can
    // be checked against the retrieved evidence once the model has finished,
    // and [DONE] is NOT emitted from either site below — the post-pipe block
    // owns the tail so the citations event lands before it.
    let answerTextForVerifier = "";
    // External-clause scrubber (flag EXTERNAL_CLAUSE_SCRUB_ENABLED). Null when
    // off, so every delta below is forwarded exactly as before. When on, each
    // delta passes through push() (which may hold back a short tail) and the
    // tail is released before ANY [DONE] — the client stops reading at [DONE].
    const clauseScrubber = externalClauseScrubEnabled() ? createStreamScrubber() : null;
    const emitDelta = (controller: TransformStreamDefaultController<Uint8Array>, text: string) => {
      if (!text) return;
      if (citationVerifierOn) answerTextForVerifier += text;
      const openAIChunk = JSON.stringify({ choices: [{ delta: { content: text } }] });
      controller.enqueue(new TextEncoder().encode(`data: ${openAIChunk}\n\n`));
    };
    const releaseScrubberTail = (controller: TransformStreamDefaultController<Uint8Array>) => {
      if (!clauseScrubber) return;
      emitDelta(controller, clauseScrubber.flush());
      if (clauseScrubber.scrubbed > 0) {
        console.log(`[Scrub] mode=${mode} external_clause_refs_removed=${clauseScrubber.scrubbed}`);
      }
    };
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        lineBuffer += new TextDecoder().decode(chunk);
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";          // retain incomplete trailing line for next chunk
        for (const raw of lines) {
          const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) {
              emitDelta(controller, clauseScrubber ? clauseScrubber.push(content) : content);
            }
            const finishReason = parsed.candidates?.[0]?.finishReason;
            if (finishReason === "STOP" && !citationVerifierOn) {
              releaseScrubberTail(controller);
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            }
          } catch { /* ignore parse errors */ }
        }
      },
      flush(controller) {
        // Process any complete line remaining in the buffer when the stream ends.
        const line = lineBuffer.endsWith("\r") ? lineBuffer.slice(0, -1) : lineBuffer;
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr && jsonStr !== "[DONE]") {
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (content) {
                emitDelta(controller, clauseScrubber ? clauseScrubber.push(content) : content);
              }
            } catch { /* ignore */ }
          }
        }
        // The stream is over: whatever the scrubber still holds is final.
        releaseScrubberTail(controller);
        if (!citationVerifierOn) {
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        }
      },
    });

    // Sources/engine metadata used to travel as response headers
    // (X-SBC-Sources / X-SBC-Source-Meta / X-Retrieval-Engine /
    // X-Graph-Expansion / X-Retrieval-Fallback). The stream now starts before
    // retrieval, so they travel as a data event immediately before the first
    // content delta instead — same information, new envelope. The frontend
    // understands both shapes (it deploys first).
    await emitEvent({
      type: "sources",
      files: usedFiles,
      sourceMeta: usedSourceMeta,
      engine: retrievalEngine,
      graphExpansion: graphExpansionCount !== null ? `on:${graphExpansionCount}` : null,
      retrievalFallback: retrievalFallbackReason,
      timing: stageLog.join(","),
    });

    // Hand the writable over to the Gemini pipe: release our writer lock and
    // let pipeTo close the stream when the model finishes ([DONE] is emitted
    // by transformStream's flush).
    //
    // With CITATION_VERIFIER_ENABLED on, the tail moves below: pipeTo keeps the
    // writable open, the verdicts go out as one event, and only then [DONE].
    // Known trade-off of the flag being ON: the client's end-of-answer signal
    // now waits for the upstream stream to END rather than for its STOP
    // finishReason. The flush path already depended on the stream ending, so a
    // provider that sent STOP and then held the connection open would stall the
    // tail — one more reason this stays default-OFF until measured live.
    earlyWriterReleased = true;
    earlyWriter.releaseLock();

    if (!citationVerifierOn) {
      await response.body!.pipeThrough(transformStream).pipeTo(earlyTs.writable);
    } else {
      // ── B1a: verified stream tail ────────────────────────────────────────
      // The evidence chunks and the section index are prepared WHILE the model
      // streams, so the only work left after the last delta is the comparison
      // itself. Both are fail-open: an empty chunk list or an empty index makes
      // the verifier stricter, never looser, and never blocks the stream.
      const verifierChunks = (() => {
        try { return parseRetrievedChunks(retrievedContextForVerifier); } catch { return []; }
      })();
      const knownSectionsPromise = verifierChunks.length > 0
        ? loadKnownSections(adminClient, verifierChunks.map((c) => c.code)).catch(
            () => new Map<string, Set<string>>(),
          )
        : Promise.resolve(new Map<string, Set<string>>());

      // preventClose keeps the writable open after Gemini finishes so the
      // citations event can still be written; without it the stream would
      // already be closed and the event silently dropped.
      await response.body!.pipeThrough(transformStream).pipeTo(earlyTs.writable, { preventClose: true });

      let tailWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
      try { tailWriter = earlyTs.writable.getWriter(); } catch { /* stream already unusable */ }
      if (tailWriter) {
        try {
          const knownSections = await knownSectionsPromise;
          const verdict = verifyCitations(answerTextForVerifier, verifierChunks, { knownSections });
          console.log(
            `[Citations] mode=${mode} verified=${verdict.summary.verified} ` +
            `paraphrased=${verdict.summary.paraphrased} unverified=${verdict.summary.unverified}`,
          );
          await tailWriter.write(sseEncoder.encode(
            `data: ${JSON.stringify({ type: "citations", items: verdict.items, summary: verdict.summary })}\n\n`,
          ));
        } catch (verifyErr) {
          // Verification is advisory. It must never cost the user an answer:
          // skip the event and fall through to [DONE] exactly as if the flag
          // were off.
          const vmsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
          console.warn(`[Citations] verification skipped (${vmsg.slice(0, 200)})`);
        }
        try { await tailWriter.write(sseEncoder.encode("data: [DONE]\n\n")); } catch { /* client gone */ }
        try { await tailWriter.close(); } catch { /* already closed */ }
      }
    }
    } catch (pipelineError) {
      // Post-headers failure: the HTTP status is already committed, so roll
      // back any un-cleared quota charge and surface the error IN-STREAM.
      // (A client disconnect also lands here — the rollback is a no-op then
      // because clearQuotaIncrement() already ran before piping.)
      if (upstreamWatchdog !== undefined) clearTimeout(upstreamWatchdog);
      if (watchdogFired) return; // stream already ended with UPSTREAM_TIMEOUT
      await rollbackQuotaIfNeeded(adminClient);
      const msg = pipelineError instanceof Error ? pipelineError.message : String(pipelineError);
      console.error(`[Pipeline] post-headers failure (mode=${mode}): ${msg.slice(0, 300)}`);
      let userMessage = language === "en" ? "Service error occurred" : "حدث خطأ في الخدمة";
      let code = "PIPELINE_ERROR";
      if (msg.startsWith("AI call failed:")) {
        code = msg.replace("AI call failed: ", "").trim();
        if (code === "GEMINI_RATE_LIMIT") {
          userMessage = language === "en"
            ? "AI provider is temporarily busy. Please try again in a minute."
            : "خدمة الذكاء الاصطناعي مشغولة مؤقتاً. يرجى المحاولة بعد دقيقة.";
        }
      }
      try {
        // Preferred path: a fresh writer (works when our original lock was
        // already released to pipeTo and the stream is still writable).
        const w = earlyTs.writable.getWriter();
        await w.write(sseEncoder.encode(`data: ${JSON.stringify({ type: "error", error: userMessage, error_code: code })}\n\n`));
        await w.close();
      } catch {
        // Original writer may still hold the lock (failure before releaseLock).
        try { earlyWriterReleased = false; await failStream({ error: userMessage, error_code: code }); } catch { /* stream unusable */ }
      }
    }
    })();

    // The pipeline runs while the client is already reading the stream;
    // waitUntil (when available) guarantees the runtime keeps it alive.
    scheduleBackground(earlyPipeline);

    markStage("headers_out");
    console.log(`[Timing] mode=${mode} headers-out at +${Date.now() - reqStart}ms (early stream)`);
    return new Response(earlyTs.readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        // Pre-headers stages only — the full breakdown (incl. retrieval and
        // gemini_connect) now arrives inside the "sources" event's `timing`.
        "X-Timing": stageLog.join(",").replace(/[^\x20-\x7E]/g, ""),
      },
    });
  } catch (error) {
    // If a quota was incremented but the AI request never produced a response,
    // roll it back so the user is not charged for a failed message.
    await rollbackQuotaIfNeeded(adminClient);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Fire safety chat error:", errorMessage);

    // callAINonStreaming throws `AI call failed: ${classification}`
    if (errorMessage.startsWith("AI call failed:")) {
      const classification = errorMessage.replace("AI call failed: ", "").trim();
      const status = classification === "GEMINI_RATE_LIMIT" || classification === "GEMINI_PROVIDER_ERROR" ? 503 : 500;
      const isRateLimit = classification === "GEMINI_RATE_LIMIT";
      const userMessage =
        language === "en"
          ? (isRateLimit
              ? "AI provider is temporarily busy. Please try again in a minute."
              : "Service error occurred")
          : (isRateLimit
              ? "الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة."
              : "حدث خطأ في الخدمة");
      return new Response(
        JSON.stringify({ error: userMessage, error_code: classification, provider: "gemini" }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
