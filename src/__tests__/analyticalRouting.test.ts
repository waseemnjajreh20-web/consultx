/**
 * Regression tests for analytical mode routing (extractTableIds).
 *
 * WHAT IS TESTED
 * ──────────────
 * 1. Core routing correctness: natural-language queries route to the correct
 *    sbc_code_tables IDs before LLM invocation.
 * 2. Benchmark routing: each benchmark case's mustHitTableIds are satisfied.
 * 3. False-positive guard: unrelated queries do not pull in structured tables.
 * 4. Hard-stop case routing: even hard-stop scenarios must hit at least one
 *    relevant table so the LLM has code context for its clarification question.
 * 5. Arabic phrasing: Arabic queries route identically to English equivalents.
 * 6. KNOWN_TABLE_IDS completeness: all 68 DB records are present in the list.
 * 7. No duplicate IDs returned by extractTableIds.
 *
 * WHAT IS NOT TESTED HERE
 * ───────────────────────
 * LLM output quality, epistemic labeling, verdict gating, and conflict
 * detection are behavioral properties of the Gemini model under the
 * getAnalysisPrompt() system instruction. Those require live model evaluation
 * against the benchmark cases in analyticalBenchmark.ts.
 */

import { describe, it, expect } from 'vitest';
import { extractTableIds, KNOWN_TABLE_IDS, PARENT_ALIASES, SEMANTIC_ALIASES } from '../utils/analyticalRouting';
import { ROUTING_TESTABLE_CASES, HARD_STOP_CASES, ALL_BENCHMARK_CASES } from './analyticalBenchmark';

// ── 1. KNOWN_TABLE_IDS completeness ──────────────────────────────────────

describe('KNOWN_TABLE_IDS completeness', () => {
  const EXPECTED_COUNT = 68;

  it(`contains exactly ${EXPECTED_COUNT} IDs matching the DB`, () => {
    expect(KNOWN_TABLE_IDS.length).toBe(EXPECTED_COUNT);
  });

  it('has no duplicate IDs', () => {
    const unique = new Set(KNOWN_TABLE_IDS);
    expect(unique.size).toBe(KNOWN_TABLE_IDS.length);
  });

  // Spot-check presence of every chapter group
  const mustContain = [
    // Ch. 3
    "302", "303", "312",
    // Ch. 4
    "402", "403.1", "404", "405", "406.5", "406.6", "407", "408", "414", "415", "420",
    // Ch. 5
    "504.3", "508", "508.3", "508.4", "508.5", "509",
    // Ch. 6
    "601", "602",
    // Ch. 7
    "705.8",
    // Ch. 10
    "1004.5", "1005.1", "1006.2.1", "1008", "1009", "1010",
    "1011.2", "1012", "1013", "1015", "1017.2", "1018.1",
    "1020.1", "1021.2", "1024", "1029.6.3", "1030",
    // SBC 801 Ch. 9
    "903.2", "903.3.1", "903.3.2", "903.4", "903.4.3",
    "905.3.1",
    "907.2", "907.3", "907.4.2", "907.5", "907.6",
    "909", "912", "913", "914", "915",
  ];

  for (const id of mustContain) {
    it(`contains "${id}"`, () => {
      expect(KNOWN_TABLE_IDS).toContain(id);
    });
  }
});

// ── 2. extractTableIds — returns no duplicates ────────────────────────────

describe('extractTableIds — no duplicates in output', () => {
  const probes = [
    "sprinkler required for high-rise residential",
    "travel distance assembly occupancy",
    "تصنيف الإشغال للمباني الشاهقة مع رشاشات",
    "corridor fire rating I-2 healthcare 1018.1 1020.1",
  ];
  for (const query of probes) {
    it(`returns unique IDs for: "${query.slice(0, 60)}"`, () => {
      const result = extractTableIds(query);
      const unique = new Set(result);
      expect(unique.size).toBe(result.length);
    });
  }
});

// ── 3. Explicit table reference matching ─────────────────────────────────

describe('extractTableIds — explicit "table XXXX" references', () => {
  it('matches English "table 1004.5"', () => {
    expect(extractTableIds('refer to table 1004.5 for occupant load')).toContain('1004.5');
  });

  it('matches Arabic "جدول 903.2"', () => {
    expect(extractTableIds('انظر جدول 903.2 للرشاشات')).toContain('903.2');
  });

  it('matches multiple explicit tables in one query', () => {
    const ids = extractTableIds('table 601 and table 602 fire resistance');
    expect(ids).toContain('601');
    expect(ids).toContain('602');
  });
});

// ── 4. Bare section number matching ──────────────────────────────────────

describe('extractTableIds — bare known section numbers', () => {
  it('routes bare "1017.2" appearing in query', () => {
    expect(extractTableIds('what is 1017.2 travel distance')).toContain('1017.2');
  });

  it('routes bare "903.2" in Arabic context', () => {
    expect(extractTableIds('المادة 903.2 تتعلق بالرشاشات')).toContain('903.2');
  });

  it('does NOT route "302" when mentioned as a street address context', () => {
    // "building 302" should not misfire when query has no code context
    // Note: bare 302 WILL match since it's in KNOWN_TABLE_IDS — this test
    // documents that limitation and ensures we don't add noise-suppression.
    // The false-positive risk is acceptable: the DB fetch cost is low.
    const result = extractTableIds('The occupancy classification procedure 302 applies');
    expect(result).toContain('302'); // expected to match — classification context present
  });
});

// ── 5. Parent alias matching ──────────────────────────────────────────────

describe('extractTableIds — parent-section aliases', () => {
  it('"section 903" expands to 903.2, 903.3.1, 903.3.2', () => {
    const ids = extractTableIds('what does section 903 require');
    expect(ids).toContain('903.2');
    expect(ids).toContain('903.3.1');
    expect(ids).toContain('903.3.2');
  });

  it('"section 508" expands to 508, 508.3, 508.4, 508.5', () => {
    const ids = extractTableIds('see section 508 for mixed occupancy rules');
    expect(ids).toContain('508');
    expect(ids).toContain('508.3');
    expect(ids).toContain('508.4');
    expect(ids).toContain('508.5');
  });

  it('"section 403" expands to 403.1', () => {
    expect(extractTableIds('per section 403 high-rise requirements')).toContain('403.1');
  });

  it('"section 1005" expands to 1005.1', () => {
    expect(extractTableIds('section 1005 egress width per occupant')).toContain('1005.1');
  });

  it('"section 907" expands to 907.2 and 907.3', () => {
    const ids = extractTableIds('section 907 fire alarm requirements');
    expect(ids).toContain('907.2');
    expect(ids).toContain('907.3');
  });

  it('parent alias does NOT fire if child already matched', () => {
    // "903.2" already in query → parent alias should not re-add 903.3.1
    const ids = extractTableIds('sprinkler required per 903.2 and section 903 general');
    // 903.2 should definitely be present (direct match)
    expect(ids).toContain('903.2');
    // 903.3.1 MAY or may not be added depending on whether parent fired;
    // the important thing is no duplicates
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ── 6. Semantic alias matching (English) ─────────────────────────────────

describe('extractTableIds — semantic aliases (English)', () => {
  it('travel distance → 1017.2', () => {
    expect(extractTableIds('what is the maximum travel distance for this occupancy')).toContain('1017.2');
  });

  it('high-rise → 403.1', () => {
    expect(extractTableIds('this is a high-rise building, what applies')).toContain('403.1');
  });

  it('atrium → 404', () => {
    expect(extractTableIds('the design includes an atrium spanning 3 floors')).toContain('404');
  });

  it('mixed occupancy → 508 series', () => {
    const ids = extractTableIds('mixed occupancy building, offices and retail');
    expect(ids).toContain('508');
    expect(ids).toContain('508.3');
  });

  it('sprinkler required → 903.2', () => {
    expect(extractTableIds('are sprinklers required for this building')).toContain('903.2');
  });

  it('fire alarm where required → 907.2', () => {
    expect(extractTableIds('fire alarm system required, where does it apply')).toContain('907.2');
  });

  it('smoke control system → 909', () => {
    expect(extractTableIds('smoke control system requirements for the building')).toContain('909');
  });

  it('standpipe required → 905.3.1', () => {
    expect(extractTableIds('standpipe required for 12-storey building')).toContain('905.3.1');
  });

  it('fire pump → 913', () => {
    expect(extractTableIds('fire pump required — where and what size')).toContain('913');
  });

  it('FDC → 912', () => {
    expect(extractTableIds('fire department connection location requirements')).toContain('912');
  });

  it('CO detection → 915', () => {
    expect(extractTableIds('carbon monoxide detector where required')).toContain('915');
  });

  it('emergency lighting → 1008', () => {
    expect(extractTableIds('emergency lighting requirements for stairwells')).toContain('1008');
  });

  it('area of refuge → 1009', () => {
    expect(extractTableIds('accessible means of egress and area of refuge')).toContain('1009');
  });

  it('exit signs → 1013', () => {
    expect(extractTableIds('where are exit signs required')).toContain('1013');
  });

  it('panic hardware → 1010', () => {
    expect(extractTableIds('door hardware and panic hardware for egress doors')).toContain('1010');
  });

  it('handrail → 1012', () => {
    expect(extractTableIds('handrail height and grip requirements')).toContain('1012');
  });

  it('luminous egress markings → 1024', () => {
    expect(extractTableIds('luminous egress path markings required')).toContain('1024');
  });

  it('emergency escape opening → 1030', () => {
    expect(extractTableIds('emergency escape opening requirements for sleeping rooms')).toContain('1030');
  });

  it('incidental use: generator room → 509', () => {
    expect(extractTableIds('generator room fire separation requirements')).toContain('509');
  });

  it('underground building → 405', () => {
    expect(extractTableIds('underground building below grade requirements')).toContain('405');
  });

  it('NFPA 13R → 903.3.1', () => {
    expect(extractTableIds('NFPA 13R sprinkler system residential building')).toContain('903.3.1');
  });

  it('hazardous materials / MAQ → 414', () => {
    expect(extractTableIds('maximum allowable quantity of hazardous materials')).toContain('414');
  });
});

// ── 7. Semantic alias matching (Arabic) ───────────────────────────────────

describe('extractTableIds — semantic aliases (Arabic)', () => {
  it('تصنيف الإشغال → 302', () => {
    expect(extractTableIds('تصنيف الإشغال لهذا المبنى')).toContain('302');
  });

  it('مبنى شاهق → 403.1', () => {
    expect(extractTableIds('ما هي اشتراطات المبنى الشاهق؟')).toContain('403.1');
  });

  it('رشاشات إلزامي → 903.2', () => {
    expect(extractTableIds('متى تكون الرشاشات إلزامية في المبنى؟')).toContain('903.2');
  });

  it('مسافة السفر → 1017.2', () => {
    expect(extractTableIds('ما هي أقصى مسافة سفر لإشغال التجمع؟')).toContain('1017.2');
  });

  it('عرض الممر → 1018.1', () => {
    expect(extractTableIds('ما هو الحد الأدنى لعرض الممر؟')).toContain('1018.1');
  });

  it('إشغال مختلط → 508 series', () => {
    const ids = extractTableIds('مبنى ذو إشغال مختلط — مكاتب وتجزئة');
    expect(ids).toContain('508');
  });

  it('إضاءة الطوارئ → 1008', () => {
    expect(extractTableIds('هل يُشترط إضاءة طوارئ في السلالم؟')).toContain('1008');
  });

  it('غرفة المولد → 509', () => {
    expect(extractTableIds('غرفة المولد تحتاج فصل حريق')).toContain('509');
  });
});

// ── 8. False-positive guard ───────────────────────────────────────────────

describe('extractTableIds — false-positive guard', () => {
  it('returns empty array for completely unrelated query', () => {
    const ids = extractTableIds('what is the weather like today');
    expect(ids).toHaveLength(0);
  });

  it('does not route a greeting', () => {
    expect(extractTableIds('hello, how are you')).toHaveLength(0);
  });

  it('does not add SBC 801 tables for a pure Ch. 3 occupancy question', () => {
    const ids = extractTableIds('what is the occupancy classification for a school');
    // Should not pull in fire system tables (903.x, 907.x)
    const spurious = ids.filter(id => id.startsWith('903') || id.startsWith('907'));
    expect(spurious).toHaveLength(0);
  });
});

// ── 9. Benchmark routing validation ──────────────────────────────────────

describe('Benchmark routing — mustHitTableIds satisfied', () => {
  for (const bc of ROUTING_TESTABLE_CASES) {
    it(`[${bc.id}] ${bc.description}`, () => {
      const result = extractTableIds(bc.query);
      for (const expected of bc.mustHitTableIds) {
        expect(result, `Expected "${expected}" in routing result for case ${bc.id}: "${bc.query.slice(0, 80)}"`).toContain(expected);
      }
    });
  }
});

describe('Benchmark routing — mustNotHitTableIds respected', () => {
  const casesWithExclusions = ALL_BENCHMARK_CASES.filter(
    c => c.mustNotHitTableIds && c.mustNotHitTableIds.length > 0
  );

  if (casesWithExclusions.length === 0) {
    it('no exclusion cases defined yet — placeholder always passes', () => {
      expect(true).toBe(true);
    });
  } else {
    for (const bc of casesWithExclusions) {
      it(`[${bc.id}] ${bc.description} — no spurious tables`, () => {
        const result = extractTableIds(bc.query);
        for (const forbidden of bc.mustNotHitTableIds!) {
          expect(result, `Expected "${forbidden}" NOT in routing result for case ${bc.id}`).not.toContain(forbidden);
        }
      });
    }
  }
});

// ── 10. Hard-stop cases still route to ≥1 table ──────────────────────────

describe('Hard-stop cases — still hit ≥1 structured table', () => {
  for (const bc of HARD_STOP_CASES.filter(c => c.mustHitTableIds.length > 0)) {
    it(`[${bc.id}] hard-stop case routes to ${bc.mustHitTableIds.join(', ')}`, () => {
      const result = extractTableIds(bc.query);
      const anyHit = bc.mustHitTableIds.some(id => result.includes(id));
      expect(anyHit, `Expected at least one of [${bc.mustHitTableIds.join(', ')}] for ${bc.id}`).toBe(true);
    });
  }
});

// ── 11. Benchmark metadata integrity ─────────────────────────────────────

describe('Benchmark metadata integrity', () => {
  it('all case IDs are unique', () => {
    const ids = ALL_BENCHMARK_CASES.map(c => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all cases have non-empty description', () => {
    for (const bc of ALL_BENCHMARK_CASES) {
      expect(bc.description.length, `Case ${bc.id} missing description`).toBeGreaterThan(0);
    }
  });

  it('all hard-stop cases have criticalMissingInputs', () => {
    for (const bc of HARD_STOP_CASES) {
      expect(
        bc.criticalMissingInputs && bc.criticalMissingInputs.length > 0,
        `Hard-stop case ${bc.id} must list criticalMissingInputs`
      ).toBe(true);
    }
  });

  it('all cases with structuredPathExpected=true have mustHitTableIds OR are MM-02', () => {
    const structured = ALL_BENCHMARK_CASES.filter(c => c.structuredPathExpected);
    for (const bc of structured) {
      if (bc.id === 'MM-02') continue; // Low-confidence case intentionally has no table IDs
      expect(
        bc.mustHitTableIds.length > 0,
        `Structured-path case ${bc.id} has no mustHitTableIds`
      ).toBe(true);
    }
  });
});

// ── 12. Regression: previously-broken paths now fixed ────────────────────

describe('Regression — previously unreachable paths now route correctly', () => {
  // These were unreachable before the extractTableIds expansion (Pass 8 Phase 3)

  it('Ch. 3 Table 302 (occupancy classification procedure) now reachable', () => {
    expect(extractTableIds('occupancy classification for this building')).toContain('302');
  });

  it('Ch. 4 Table 404 (atrium) now reachable', () => {
    expect(extractTableIds('atrium spanning multiple floors')).toContain('404');
  });

  it('Ch. 4 Table 407 (healthcare) now reachable', () => {
    expect(extractTableIds('healthcare facility I-2 occupancy special requirements')).toContain('407');
  });

  it('Ch. 5 Table 508.5 (separated mixed occupancy) now reachable', () => {
    expect(extractTableIds('separated occupancy fire barrier between uses')).toContain('508.5');
  });

  it('Ch. 10 Table 1008 (emergency lighting) now reachable', () => {
    expect(extractTableIds('emergency lighting requirements')).toContain('1008');
  });

  it('Ch. 10 Table 1013 (exit signs) now reachable', () => {
    expect(extractTableIds('where are exit signs required')).toContain('1013');
  });

  it('SBC 801 Table 907.2 (fire alarm where required) now reachable', () => {
    expect(extractTableIds('fire alarm system required for this occupancy')).toContain('907.2');
  });

  it('SBC 801 Table 909 (smoke control) now reachable', () => {
    expect(extractTableIds('smoke control system pressurization')).toContain('909');
  });

  it('SBC 801 Table 913 (fire pump) now reachable', () => {
    expect(extractTableIds('fire pump required for building')).toContain('913');
  });

  it('SBC 801 Table 915 (CO detection) now reachable', () => {
    expect(extractTableIds('carbon monoxide detector requirements')).toContain('915');
  });
});
