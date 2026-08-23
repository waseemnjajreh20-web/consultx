/**
 * Prompt-contract tests for fire-safety-chat.
 *
 * This is a life-safety product, so the prompt contract is treated as code:
 * every rule the model is given must be provable here rather than asserted in a
 * commit message. The four groups below correspond to the four defects that
 * motivated supabase/functions/fire-safety-chat/promptContract.ts:
 *
 *   1. NFPA / SFPE named as available sources when retrieval cannot return them
 *      (docs/audits/advisory-retrieval-truth-20260823.md section 2.د)
 *   2. the [SWITCH:...] escalation protocol, which is load-bearing
 *   3. the certainty labels deleted by commit 587fd5b
 *   4. the section-sign character, banned everywhere by CLAUDE.md
 *
 * Plus the structured-table injection, whose old header ordered verbatim
 * citation of rows later proved to carry inverted requirements
 * (docs/audits/SAFETY-ALERT-code-tables-20260823.md).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  ABSENT_STANDARDS,
  ALL_MODE_PROMPTS,
  buildStructuredTableBlock,
  CORE_RULES,
  findAbsentSourceClaims,
  getAnalysisPrompt,
  getPrimaryPrompt,
  getStandardPrompt,
  getValidationPrompt,
  SECTION_SIGN,
  STRUCTURED_TABLES_HEADER,
  SWITCH_MARKER_ADVISORY,
  SWITCH_MARKER_ANALYTICAL,
  type StructuredTableRow,
} from "../../supabase/functions/fire-safety-chat/promptContract.ts";
import { parseSwitchMarker } from "../utils/chatRouting";

/** Every prompt string the function can send, in both languages. */
function everyPromptString(): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = [
    { label: "primary", text: getPrimaryPrompt() },
  ];
  for (const lang of ["ar", "en"]) {
    out.push({ label: `standard/${lang}`, text: getStandardPrompt(lang) });
    out.push({ label: `analysis/${lang}`, text: getAnalysisPrompt(lang) });
    for (const mode of ["primary", "standard", "analysis"]) {
      out.push({
        label: `validation/${mode}/${lang}`,
        text: getValidationPrompt(mode, lang),
      });
    }
  }
  return out;
}

// ===========================================================================
// (a) All three mode prompts build, and none makes an NFPA/SFPE source claim
// ===========================================================================
describe("mode prompts build", () => {
  it("builds all three modes without throwing", () => {
    expect(ALL_MODE_PROMPTS.map((p) => p.mode)).toEqual([
      "primary",
      "standard",
      "analysis",
    ]);
    for (const { mode, build } of ALL_MODE_PROMPTS) {
      const text = build();
      expect(text, `${mode} prompt is empty`).toBeTruthy();
      expect(text.length, `${mode} prompt is suspiciously short`).toBeGreaterThan(200);
    }
  });

  it("builds standard and analysis in both languages with the right RESPOND IN", () => {
    expect(getStandardPrompt("ar")).toContain("RESPOND IN: ARABIC");
    expect(getStandardPrompt("en")).toContain("RESPOND IN: ENGLISH");
    expect(getAnalysisPrompt("ar")).toContain("RESPOND IN: ARABIC");
    expect(getAnalysisPrompt("en")).toContain("RESPOND IN: ENGLISH");
  });

  it("keeps the diagnostic protocol and the I–X analytical structure intact", () => {
    // These are the two structures the modes are actually defined by. If an
    // edit to the source-claim wording ever ate one of them, this catches it.
    expect(getStandardPrompt("ar")).toContain("بروتوكول التشخيص التفاعلي الإلزامي");
    expect(getStandardPrompt("ar")).toContain("هيكل الإجابة النهائي");
    expect(getAnalysisPrompt("ar")).toContain("بروتوكول ما قبل التحليل الإلزامي");
    for (const numeral of ["I.", "V.", "IX.", "X."]) {
      expect(getAnalysisPrompt("ar"), `analysis prompt lost section ${numeral}`)
        .toContain(`**${numeral}`);
    }
  });
});

describe("no NFPA/SFPE/IBC/IFC source claims", () => {
  it("makes no unrestricted mention of an absent standard in any prompt", () => {
    for (const { label, text } of everyPromptString()) {
      const claims = findAbsentSourceClaims(text);
      expect(claims, `${label} still claims absent sources: ${claims.join(" || ")}`)
        .toEqual([]);
    }
  });

  it("does not carry any of the six original claim strings", () => {
    // Verbatim fragments of the sites removed on 2026-08-23. Kept as literals so
    // a revert or a copy-paste from git history fails loudly.
    const removed = [
      "معايير NFPA، معايير SFPE",
      "ملفات NFPA, التفسيرات Commentary, SFPE",
      "مصادر المراجع فقط (Commentary, NFPA, SFPE)",
      "ربط SBC بمعايير NFPA/SFPE",
      "NFPA / SFPE إن انطبق ولماذا",
      "SBC 801 للأنظمة → NFPA للتفاصيل التقنية",
      "(SBC 201, SBC 801, NFPA, SFPE)",
      "ومعايير NFPA/SFPE حصرياً",
    ];
    for (const { label, text } of everyPromptString()) {
      for (const claim of removed) {
        expect(text, `${label} reintroduced the removed claim: ${claim}`)
          .not.toContain(claim);
      }
    }
  });

  it("states positively what the retrievable corpus is", () => {
    // Truthful replacement, not silent deletion.
    for (const lang of ["ar", "en"]) {
      for (const text of [getStandardPrompt(lang), getAnalysisPrompt(lang)]) {
        expect(text).toContain("SBC 201");
        expect(text).toContain("SBC 801");
        expect(text).toContain("نطاق المصادر المتاحة فعلياً");
        expect(text).toContain("غير مُفهرسة وغير قابلة للاسترجاع");
      }
    }
  });

  it("gives the model a labelled, non-citation route for general knowledge", () => {
    const disclosure = "معرفة هندسية عامة — لا يوجد مصدر مسترجع في النظام لهذه النقطة.";
    expect(getStandardPrompt("ar")).toContain(disclosure);
    expect(getAnalysisPrompt("ar")).toContain(disclosure);
    // Primary loads no documents at all, so it carries the compact form.
    expect(getPrimaryPrompt()).toContain("معرفة هندسية عامة بلا مصدر");
  });

  it("names every absent standard in its denial, not just NFPA", () => {
    for (const std of ABSENT_STANDARDS) {
      expect(getStandardPrompt("ar"), `denial omits ${std}`).toContain(std);
      expect(getAnalysisPrompt("ar"), `denial omits ${std}`).toContain(std);
    }
  });
});

// ===========================================================================
// (b) [SWITCH:...] protocol intact — prompt and parser must agree
// ===========================================================================
describe("[SWITCH:...] escalation protocol", () => {
  it("uses the exact marker literals the product depends on", () => {
    expect(SWITCH_MARKER_ADVISORY).toBe("[SWITCH:استشاري]");
    expect(SWITCH_MARKER_ANALYTICAL).toBe("[SWITCH:تحليلي]");
  });

  it("instructs the primary prompt to emit both markers", () => {
    const prompt = getPrimaryPrompt();
    expect(prompt).toContain(SWITCH_MARKER_ADVISORY);
    expect(prompt).toContain(SWITCH_MARKER_ANALYTICAL);
    expect(prompt).toContain("قواعد الانتقال بين الأوضاع");
    // Escalation must stay consent-gated, never automatic.
    expect(prompt).toContain("لا تنتقل تلقائياً أبداً");
  });

  it("round-trips: what the prompt tells the model to emit is what the parser accepts", () => {
    // The real failure mode is drift between these two files, so assert the
    // round trip rather than re-testing hardcoded literals on either side.
    const advisory = parseSwitchMarker(`جواب. ${SWITCH_MARKER_ADVISORY}`);
    expect(advisory.found).toBe(true);
    expect(advisory.targetMode).toBe("standard");
    expect(advisory.cleanContent).not.toContain("[SWITCH:");

    const analytical = parseSwitchMarker(`جواب. ${SWITCH_MARKER_ANALYTICAL}`);
    expect(analytical.found).toBe(true);
    expect(analytical.targetMode).toBe("analysis");
    expect(analytical.cleanContent).not.toContain("[SWITCH:");
  });

  it("only the primary prompt drives escalation", () => {
    // Advisory/Analytical must not tell the model to bounce the user onward.
    expect(getStandardPrompt("ar")).not.toContain("[SWITCH:");
    expect(getAnalysisPrompt("ar")).not.toContain("[SWITCH:");
  });
});

// ===========================================================================
// (c) Certainty discipline restored from 587fd5b^
// ===========================================================================
describe("certainty labelling restored from 587fd5b^", () => {
  it("CORE_RULES carries rule 4-B and all three labels", () => {
    expect(CORE_RULES).toContain("CERTAINTY LABELING (MANDATORY)");
    expect(CORE_RULES).toContain("[NO SOURCE]");
    expect(CORE_RULES).toContain("[REQUIRES SOURCE CONFIRMATION]");
    expect(CORE_RULES).toContain("[INDIRECT — Section Y context]");
  });

  it("forbids a compliance verdict without source support", () => {
    expect(CORE_RULES).toContain(
      "NEVER write ✅ Compliant or ❌ Non-Compliant when source support is absent",
    );
    expect(CORE_RULES).toContain("NEVER imply certainty when the exact clause is absent");
  });

  it("restores the 6-LANGUAGE-PRECISION exception so definitiveness is not a licence", () => {
    expect(CORE_RULES).toContain(
      '"Definitive" applies to retrieved code text — it is NOT a license to state compliance without a source.',
    );
  });

  it("carries the labels into both retrieval-backed mode prompts", () => {
    for (const lang of ["ar", "en"]) {
      for (const text of [getStandardPrompt(lang), getAnalysisPrompt(lang)]) {
        expect(text).toContain("[NO SOURCE]");
        expect(text).toContain("[REQUIRES SOURCE CONFIRMATION]");
      }
    }
  });

  it("wires [NO SOURCE] into the analytical compliance table", () => {
    // The table is where an unsourced verdict would actually reach the reader.
    expect(getAnalysisPrompt("ar")).toContain(
      "إذا كانت خانة المرجع [NO SOURCE]: يُمنع ✅ ويُمنع ❌ بأي صيغة",
    );
  });

  it("asks the retry prompts for the labels too", () => {
    expect(getValidationPrompt("analysis", "ar")).toContain("[NO SOURCE]");
    expect(getValidationPrompt("standard", "ar")).toContain("[NO SOURCE]");
    expect(getValidationPrompt("analysis", "en")).toContain("[REQUIRES SOURCE CONFIRMATION]");
  });

  it("bans mandatory-language without literal retrieved code text", () => {
    for (const lang of ["ar", "en"]) {
      const text = getStandardPrompt(lang);
      expect(text).toContain("سقف لغة اليقين");
      // Arabic morphological variants — the v1 rule was bypassed through these.
      for (const banned of ["إلزامي", "إلزامية", "إلزامياً", "بشكل قاطع", "بالتأكيد"]) {
        expect(text, `ban list lost ${banned}`).toContain(`- "${banned}"`);
      }
      for (const banned of ["mandatory", "definitively required", "without any doubt"]) {
        expect(text, `ban list lost ${banned}`).toContain(`- "${banned}"`);
      }
      // A ban with no permitted alternative just gets ignored.
      for (const allowed of ["يرجح", "قرار أولي مشروط"]) {
        expect(text, `substitute list lost ${allowed}`).toContain(`- "${allowed}"`);
      }
    }
  });

  it("keeps the sprinkler and fire-alarm evidence chains independent", () => {
    expect(getStandardPrompt("ar")).toContain("INDEPENDENT EVIDENCE CHAINS");
    expect(getStandardPrompt("ar")).toContain("قراران منفصلان تماماً");
  });
});

// ===========================================================================
// (d) The section-sign character appears nowhere
// ===========================================================================
describe("section-sign ban", () => {
  it("SECTION_SIGN is the character CLAUDE.md bans", () => {
    expect(SECTION_SIGN).toBe(String.fromCharCode(0xa7));
    expect(SECTION_SIGN.charCodeAt(0)).toBe(167);
  });

  it("no prompt string contains it", () => {
    for (const { label, text } of everyPromptString()) {
      expect(text.includes(SECTION_SIGN), `${label} contains the banned character`)
        .toBe(false);
    }
  });

  it("no structured-table block contains it", () => {
    const block = buildStructuredTableBlock([
      {
        table_id: "1004.5",
        table_title: "Maximum Floor Area Allowances per Occupant",
        source_code: "SBC 201",
        edition: "2024",
        content_md: "| Occupancy | Factor |\n|---|---|\n| Business | 9.3 |",
        notes: "note",
        supersedes: ["1004.1.2"],
      },
    ]);
    expect(block.includes(SECTION_SIGN)).toBe(false);
  });

  it("appears nowhere in the source files either, comments included", () => {
    // CLAUDE.md bans the character everywhere, not just in model-facing text.
    // This caught a real occurrence in a doc comment on 2026-08-23.
    const root = fileURLToPath(new URL("../../", import.meta.url));
    for (const rel of [
      "supabase/functions/fire-safety-chat/promptContract.ts",
      "supabase/functions/fire-safety-chat/index.ts",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src.includes(SECTION_SIGN), `${rel} contains the banned character`)
        .toBe(false);
    }
  });

  it("instructs the model to write Section / القسم instead", () => {
    expect(CORE_RULES).toContain("NEVER use the section-sign character in any output");
    expect(getStandardPrompt("ar")).toContain(
      'ممنوع استخدام رمز القسم في الإخراج. اكتب "Section" بالإنجليزية أو "القسم" بالعربية.',
    );
    expect(getPrimaryPrompt()).toContain("ممنوع استخدام رمز القسم في الإخراج");
  });
});

// ===========================================================================
// Structured-table injection — no blanket authority, no verbatim citation order
// ===========================================================================
describe("structured code table injection", () => {
  const row: StructuredTableRow = {
    table_id: "1017.2",
    table_title: "Exit Access Travel Distance",
    source_code: "SBC 201",
    edition: "2024",
    content_md: "| Occupancy | Without Sprinklers | With Sprinklers |\n|---|---|---|\n| H-1 | 75 ft | Not Permitted |",
    notes: "footnote a",
    supersedes: ["1016.2"],
  };

  it("returns nothing for an empty row set", () => {
    expect(buildStructuredTableBlock([])).toBe("");
  });

  it("no longer asserts DB authority", () => {
    const block = buildStructuredTableBlock([row]);
    expect(block).not.toContain("DB-AUTHORITATIVE");
    expect(block).not.toContain("PRIMARY authoritative source");
    expect(block).not.toContain("📋 SOURCE:");
  });

  it("no longer orders verbatim citation", () => {
    const block = buildStructuredTableBlock([row]);
    expect(block).not.toContain("CITE THESE VERBATIM");
    expect(block).not.toContain("Quote them exactly.");
    expect(block).toContain("Do NOT quote a row verbatim as a code citation");
  });

  it("declares the provenance as unverified transcription", () => {
    const block = buildStructuredTableBlock([row]);
    expect(block).toContain("UNVERIFIED TRANSCRIPTION");
    expect(block).toContain("NOT extracted from the SBC\nsource documents");
    expect(block).toContain("[UNVERIFIED TABLE — requires confirmation against the SBC source text]");
    expect(block).toContain("STORED TRANSCRIPTION — provenance unverified");
  });

  it("says plainly that no verified/normative column exists to lean on", () => {
    // The audit named a `normative` column, but it is on sbc_documents, not on
    // sbc_code_tables. The block must not imply a filter it cannot apply.
    expect(STRUCTURED_TABLES_HEADER).toContain(
      'This table carries no\n"verified" and no "normative" column',
    );
  });

  it("subordinates the rows to retrieved SBC document text", () => {
    const block = buildStructuredTableBlock([row]);
    expect(block).toContain("Retrieved SBC document text ALWAYS overrides these rows");
    expect(block).toContain("higher-trust source");
  });

  it("carries the unsprinklered-vs-sprinklered sanity gate", () => {
    // This is the check that would have caught Table 1017.2 without an expert.
    const block = buildStructuredTableBlock([row]);
    expect(block).toContain("SANITY GATE");
    expect(block).toContain("Sprinklers never make a requirement stricter");
    expect(block).toContain("feet or inches");
  });

  it("separates code text from interpretation", () => {
    const block = buildStructuredTableBlock([row]);
    expect(block).toContain("Separate code text from interpretation");
    expect(block).toContain(
      "**Editorial note (interpretation added by the application, NOT code text):** footnote a",
    );
    expect(block).toContain("Edition note (editorial claim, unverified)");
    // The old wording ordered the model to always cite the superseding id.
    expect(block).not.toContain("Always cite 1017.2 when working with SBC 201 2024");
  });

  it("still passes the row content through", () => {
    const block = buildStructuredTableBlock([row]);
    expect(block).toContain(row.content_md);
    expect(block).toContain("Table 1017.2");
  });

  it("tolerates null optional columns without emitting 'undefined'", () => {
    const sparse: StructuredTableRow = {
      table_id: "903.2",
      content_md: "| a | b |",
      table_title: null,
      source_code: null,
      edition: null,
      notes: null,
      supersedes: null,
    };
    const block = buildStructuredTableBlock([sparse]);
    expect(block).not.toContain("undefined");
    expect(block).not.toContain("null");
    expect(block).toContain("unknown source");
  });
});

// ===========================================================================
// The claim-detector itself must be able to fail
// ===========================================================================
describe("findAbsentSourceClaims", () => {
  it("flags an unrestricted mention", () => {
    expect(findAbsentSourceClaims("استخدم فقط المراجع (SBC 201, NFPA, SFPE)."))
      .toHaveLength(1);
  });

  it("does not flag a mention that restricts", () => {
    expect(findAbsentSourceClaims("ممنوع تقديم محتوى NFPA كاستشهاد مسترجع."))
      .toEqual([]);
  });

  it("ignores lines that name no absent standard", () => {
    expect(findAbsentSourceClaims("SBC 201 و SBC 801 فقط.")).toEqual([]);
  });
});
