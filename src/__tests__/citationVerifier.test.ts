/**
 * Runtime citation verifier (B1a) — unit + source-contract tests.
 *
 * Two halves:
 *   1. The pure verifier is imported and exercised directly (it touches no Deno
 *      global at import time, which is the whole reason it is its own module).
 *   2. index.ts is read as TEXT, never imported — it calls serve() at module
 *      top level. The wiring assertions below are what stop the streaming
 *      contract from regressing: with CITATION_VERIFIER_ENABLED off the two
 *      original [DONE] emission sites must still exist, and with it on the
 *      "citations" event must be emitted exactly once and BEFORE the final
 *      [DONE] — the client stops reading at [DONE], so a citations event
 *      emitted after it would never be seen.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  codeFromFile,
  DEFAULT_MAX_TOKENS,
  extractCitationTokens,
  normalizeCode,
  normalizeForCompare,
  parseRetrievedChunks,
  resetKnownSectionCache,
  loadKnownSections,
  verifyCitations,
  type VerifierChunk,
} from "../../supabase/functions/fire-safety-chat/citationVerifier.ts";
import { parseCitationToken } from "../utils/inlineCitation";
import {
  applyInlineMarkdown,
  buildCitationStatusIndex,
  type CitationStatusItem,
} from "../components/ChatMarkdownRenderer";

const INDEX_SRC = readFileSync(
  path.resolve(__dirname, "../../supabase/functions/fire-safety-chat/index.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const AR_801_CONTENT =
  "An automatic sprinkler system shall be installed throughout all buildings. " +
  "يجب تركيب نظام رشاشات تلقائية في جميع مجموعات الإشغال من النوع (م) عندما تتجاوز مساحة الطابق 1200 متر مربع.";

const chunk801: VerifierChunk = {
  code: "SBC-801",
  section: "903.2.7",
  page: 411,
  content: AR_801_CONTENT,
  fileName: "SBC 801 - Fire Code_1-250_extracted_chunks.json",
};

const chunk201: VerifierChunk = {
  code: "SBC-201",
  section: "1017.2",
  page: 120,
  content:
    "Exit access travel distance shall not exceed 60 m in buildings equipped throughout with an automatic sprinkler system.",
  fileName: "SBC 201 - The Saudi General Building Code-1-250_extracted_chunks.json",
};

const chunk501: VerifierChunk = {
  code: "SBC-501",
  section: "714.4.1",
  page: 88,
  content:
    "Hazardous exhaust ducts shall extend directly to the exterior of the building and shall terminate not less than 250 mm above the roof surface.",
  fileName: "SBC501_CC2024_305-509_chunks.json",
};

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Normalization + token grammar
// ─────────────────────────────────────────────────────────────────────────────

describe("normalization", () => {
  it("folds Arabic diacritics, tatweel, alef variants and whitespace runs", () => {
    const a = normalizeForCompare("يَجِبُ تركيب نظـــام   رشاشات");
    const b = normalizeForCompare("يجب تركيب نظام رشاشات");
    expect(a).toBe(b);
  });

  it("folds alef/ya/ta-marbuta spelling variants and lowercases Latin", () => {
    expect(normalizeForCompare("الإشغال")).toBe(normalizeForCompare("الاشغال"));
    expect(normalizeForCompare("علي")).toBe(normalizeForCompare("على"));
    expect(normalizeForCompare("SHALL Be")).toBe("shall be");
  });

  it("normalizes every code spelling to the hyphenated form", () => {
    expect(normalizeCode("SBC801")).toBe("SBC-801");
    expect(normalizeCode("SBC 201")).toBe("SBC-201");
    expect(normalizeCode("sbc-501")).toBe("SBC-501");
    expect(normalizeCode("NFPA 13")).toBe("UNKNOWN");
  });

  it("derives the owning code from both storage filename schemes", () => {
    expect(codeFromFile(chunk201.fileName)).toBe("SBC-201");
    expect(codeFromFile(chunk501.fileName)).toBe("SBC-501");
    expect(codeFromFile("random.json")).toBe("UNKNOWN");
  });
});

describe("token grammar agrees with the frontend parser (src/utils/inlineCitation.ts)", () => {
  // The four sample tokens quoted verbatim in promptContract.ts
  // CITATION_TOKEN_CONTRACT, plus the page-fallback and table forms.
  const samples = [
    "[SBC-201 Section 1017.2 | conf:high]",
    "[SBC-801 Section 903.2.7 | conf:medium]",
    "[SBC-501 Section 507.2 | conf:high]",
    "[SBC-401 Section 411.3 | conf:high]",
    "[SBC-201 pp.411-435 | conf:medium]",
    "[SBC-201 Table 1004.5 | conf:high]",
  ];

  it("extracts the same code and section/table/page as parseCitationToken", () => {
    for (const s of samples) {
      const [hit] = extractCitationTokens(`نص ${s} نص`);
      const parsed = parseCitationToken(s);
      expect(hit, s).toBeDefined();
      expect(parsed, s).not.toBeNull();
      expect(hit.code, s).toBe(parsed!.src.toUpperCase().replace("SBC", "SBC-"));
      expect(hit.section, s).toBe(parsed!.sectionRef ?? parsed!.tableRef ?? null);
      expect(hit.page, s).toBe(parsed!.pageStart);
    }
  });

  it("ignores brackets that are not citation tokens", () => {
    expect(extractCitationTokens("[NO SOURCE] and [REQUIRES SOURCE CONFIRMATION]")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Chunk parsing from the assembled context string
// ─────────────────────────────────────────────────────────────────────────────

describe("parseRetrievedChunks", () => {
  it("reads the vector header's Code / Section / Pages fields", () => {
    const ctx =
      "\n=== SBC REFERENCE DOCUMENTS (Vector Search Results) ===\n" +
      "\n=== SBC501_CC2024_305-509_chunks.json | Code: SBC-501 | Section: 714.4.1 | Pages: 88-89 | Similarity: 0.812 ===\n" +
      "Hazardous exhaust ducts shall extend directly to the exterior.\n";
    const chunks = parseRetrievedChunks(ctx);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].code).toBe("SBC-501");
    expect(chunks[0].section).toBe("714.4.1");
    expect(chunks[0].page).toBe(88);
    expect(chunks[0].content).toContain("Hazardous exhaust ducts");
  });

  it("falls back to the filename for the keyword header shape and drops N/A sections", () => {
    const ctx =
      "\n\n📚 SBC REFERENCE DOCUMENTS (MOST RELEVANT SECTIONS SELECTED):\n" +
      "\n=== SBC 801 - Fire Code_1-250_extracted_chunks.json (3 relevant sections) ===\n" +
      "Sprinkler text here.\n";
    const chunks = parseRetrievedChunks(ctx);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].code).toBe("SBC-801");
    expect(chunks[0].section).toBeUndefined();
    expect(chunks[0].fileName).toBe("SBC 801 - Fire Code_1-250_extracted_chunks.json");
  });

  it("returns nothing for an empty context", () => {
    expect(parseRetrievedChunks("")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Verification rules
// ─────────────────────────────────────────────────────────────────────────────

describe("verifyCitations — quote check", () => {
  it("verifies an Arabic quote that differs only by diacritics and whitespace", () => {
    const answer =
      'ينص الكود على أن "يَجِبُ تركيب نظـــام رشاشات تلقائية   في جميع مجموعات الإشغال من النوع (م)" ' +
      "وهو متطلب أساسي [SBC-801 Section 903.2.7 | conf:high]";
    const { items, summary } = verifyCitations(answer, [chunk801, chunk201]);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("verified");
    expect(items[0].score).toBeGreaterThanOrEqual(0.9);
    expect(items[0].reasons).toContain("quote_verbatim");
    expect(summary).toEqual({ verified: 1, paraphrased: 0, unverified: 0 });
  });

  it("lands a reworded quote in the paraphrase band", () => {
    const answer =
      'The code states: "Exit access travel distance must not exceed 60 m in buildings provided throughout ' +
      'with automatic sprinkler systems." [SBC-201 Section 1017.2 | conf:high]';
    const { items } = verifyCitations(answer, [chunk201, chunk801]);
    expect(items).toHaveLength(1);
    expect(items[0].score).toBeGreaterThanOrEqual(0.6);
    expect(items[0].score).toBeLessThan(0.9);
    expect(items[0].status).toBe("paraphrased");
    expect(items[0].reasons).toContain("quote_paraphrased");
  });

  it("marks a quote that appears nowhere in the evidence unverified", () => {
    const answer =
      'النص يقول "smoke control systems shall provide a minimum pressure difference of 25 Pa across every ' +
      'smoke barrier at all times" [SBC-801 Section 903.2.7 | conf:high]';
    const { items } = verifyCitations(answer, [chunk801]);
    expect(items[0].status).toBe("unverified");
    expect(items[0].reasons).toContain("quote_not_in_evidence");
  });

  it("cannot promote an unquoted token past paraphrased, and keeps it anchored", () => {
    const answer = "تُشترط الرشاشات التلقائية لهذا الإشغال [SBC-801 Section 903.2.7 | conf:high]";
    const { items } = verifyCitations(answer, [chunk801]);
    expect(items[0].quote).toBeNull();
    expect(items[0].status).toBe("paraphrased");
    expect(items[0].reasons).toContain("no_quote_found");
  });
});

describe("verifyCitations — family check", () => {
  it("flags a quote taken from another code's chunk", () => {
    const answer =
      'ينص الكود: "Hazardous exhaust ducts shall extend directly to the exterior of the building and shall ' +
      'terminate not less than 250 mm above the roof surface." [SBC-201 Section 714.4.1 | conf:high]';
    const { items } = verifyCitations(answer, [chunk201, chunk501]);
    expect(items[0].status).toBe("unverified");
    expect(items[0].reasons).toContain("code_family_mismatch:SBC-501");
  });

  it("does not flag a family mismatch when the same-code evidence carries the quote", () => {
    const answer =
      'ينص الكود: "Hazardous exhaust ducts shall extend directly to the exterior of the building and shall ' +
      'terminate not less than 250 mm above the roof surface." [SBC-501 Section 714.4.1 | conf:high]';
    const { items } = verifyCitations(answer, [chunk201, chunk501]);
    expect(items[0].status).toBe("verified");
    expect(items[0].reasons.some((r) => r.startsWith("code_family_mismatch"))).toBe(false);
  });

  it("reports when no chunk of the cited code was retrieved at all", () => {
    const answer = 'النص: "Exit access travel distance shall not exceed 60 m" [SBC-401 Section 411.3 | conf:high]';
    const { items } = verifyCitations(answer, [chunk201]);
    expect(items[0].status).toBe("unverified");
    expect(items[0].reasons).toContain("no_evidence_for_code");
  });
});

describe("verifyCitations — section existence", () => {
  const answer =
    'ينص: "An automatic sprinkler system shall be installed throughout all buildings." ' +
    "[SBC-801 Section 999.9.9 | conf:high]";

  it("marks a section that is in neither the evidence nor the index unverified", () => {
    const { items } = verifyCitations(answer, [chunk801]);
    expect(items[0].status).toBe("unverified");
    expect(items[0].reasons).toContain("section_missing_from_evidence");
  });

  it("accepts a section supplied by the known-section index", () => {
    const knownSections = new Map([["SBC-801", new Set(["999.9.9"])]]);
    const { items } = verifyCitations(answer, [chunk801], { knownSections });
    expect(items[0].status).toBe("verified");
    expect(items[0].reasons).toContain("section_from_known_index");
    expect(items[0].reasons).not.toContain("section_missing_from_evidence");
  });

  it("does not demand a section from a page-only token", () => {
    const ppAnswer =
      'ينص: "An automatic sprinkler system shall be installed throughout all buildings." ' +
      "[SBC-801 pp.411-435 | conf:medium]";
    const { items } = verifyCitations(ppAnswer, [chunk801]);
    expect(items[0].section).toBeNull();
    expect(items[0].page).toBe(411);
    expect(items[0].status).toBe("verified");
    expect(items[0].reasons).toContain("page_only_token");
  });
});

describe("verifyCitations — caps and summary", () => {
  it("caps the number of tokens examined at 60 by default", () => {
    const answer = Array.from({ length: 70 }, (_, i) => `claim [SBC-201 Section 1001.${i + 1} | conf:high]`).join(" ");
    const { items } = verifyCitations(answer, [chunk201]);
    expect(DEFAULT_MAX_TOKENS).toBe(60);
    expect(items).toHaveLength(60);
  });

  it("honours an explicit maxTokens", () => {
    const answer = Array.from({ length: 20 }, (_, i) => `claim [SBC-201 Section 1001.${i + 1} | conf:high]`).join(" ");
    expect(verifyCitations(answer, [chunk201], { maxTokens: 5 }).items).toHaveLength(5);
  });

  it("collapses a repeated token to one verdict", () => {
    const tok = "[SBC-801 Section 903.2.7 | conf:high]";
    const answer = `أولاً ${tok} وثانياً ${tok} وثالثاً ${tok}`;
    const { items, summary } = verifyCitations(answer, [chunk801]);
    expect(items).toHaveLength(1);
    expect(summary.verified + summary.paraphrased + summary.unverified).toBe(1);
  });

  it("summary counts match the item statuses", () => {
    const answer =
      'أولاً "An automatic sprinkler system shall be installed throughout all buildings." [SBC-801 Section 903.2.7 | conf:high] ' +
      'ثانياً "Exit access travel distance must not exceed 60 m in buildings provided throughout with automatic sprinkler systems." [SBC-201 Section 1017.2 | conf:high] ' +
      'ثالثاً "smoke control systems shall provide a minimum pressure difference of 25 Pa across every smoke barrier" [SBC-801 Section 907.2.3 | conf:high]';
    const { items, summary } = verifyCitations(answer, [chunk801, chunk201]);
    expect(items).toHaveLength(3);
    const tally = { verified: 0, paraphrased: 0, unverified: 0 };
    for (const it of items) tally[it.status]++;
    expect(summary).toEqual(tally);
    expect(summary.verified).toBe(1);
    expect(summary.paraphrased).toBe(1);
    expect(summary.unverified).toBe(1);
  });

  it("returns an empty result for an answer with no tokens", () => {
    expect(verifyCitations("لا يوجد استشهاد هنا", [chunk801])).toEqual({
      items: [],
      summary: { verified: 0, paraphrased: 0, unverified: 0 },
    });
  });

  it("survives empty / malformed chunk input", () => {
    const answer = 'ينص: "An automatic sprinkler system shall be installed." [SBC-801 Section 903.2.7 | conf:high]';
    expect(() => verifyCitations(answer, [])).not.toThrow();
    expect(verifyCitations(answer, []).items[0].status).toBe("unverified");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Known-section index loader (fail-open)
// ─────────────────────────────────────────────────────────────────────────────

describe("loadKnownSections", () => {
  beforeEach(() => resetKnownSectionCache());

  /** Minimal PostgREST builder stub: from().select().eq().not().limit() */
  const clientReturning = (rows: unknown, error: unknown = null, seen?: string[]) => ({
    from(table: string) {
      seen?.push(table);
      const b: any = {
        select: () => b,
        eq: (_c: string, v: string) => { seen?.push(v); return b; },
        not: () => b,
        limit: () => Promise.resolve({ data: rows, error }),
      };
      return b;
    },
  });

  it("dedupes section numbers and queries the unhyphenated code_type", async () => {
    const seen: string[] = [];
    const client = clientReturning(
      [{ section_number: "903.2.7" }, { section_number: "903.2.7" }, { section_number: "907.2.3" }, { section_number: null }],
      null,
      seen,
    );
    const idx = await loadKnownSections(client, ["SBC-801"]);
    expect(seen).toContain("sbc_documents");
    expect(seen).toContain("SBC801");
    expect([...idx.get("SBC-801")!].sort()).toEqual(["903.2.7", "907.2.3"]);
  });

  it("fails open to an empty set on a query error", async () => {
    const idx = await loadKnownSections(clientReturning(null, { message: "42P01" }), ["SBC-201"]);
    expect(idx.get("SBC-201")!.size).toBe(0);
  });

  it("fails open to an empty set when the client throws", async () => {
    const throwing = { from: () => { throw new Error("network"); } };
    const idx = await loadKnownSections(throwing, ["SBC-201"]);
    expect(idx.get("SBC-201")!.size).toBe(0);
  });

  it("serves the second call from cache within the TTL", async () => {
    let calls = 0;
    const counting = {
      from() {
        calls++;
        const b: any = { select: () => b, eq: () => b, not: () => b, limit: () => Promise.resolve({ data: [{ section_number: "1017.2" }], error: null }) };
        return b;
      },
    };
    await loadKnownSections(counting, ["SBC-201"]);
    await loadKnownSections(counting, ["SBC-201"]);
    expect(calls).toBe(1);
    // Past the one-hour TTL it reloads.
    await loadKnownSections(counting, ["SBC-201"], Date.now() + 61 * 60 * 1000);
    expect(calls).toBe(2);
  });

  it("ignores codes outside the four known SBC families", async () => {
    const idx = await loadKnownSections(clientReturning([]), ["NFPA-13"]);
    expect(idx.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Renderer badges (the client half of the feature)
// ─────────────────────────────────────────────────────────────────────────────

describe("citation chip badges", () => {
  const TOKEN = "[SBC-801 Section 903.2.7 | conf:high]";
  const statusItem = (status: CitationStatusItem["status"], reasons: string[] = []): CitationStatusItem[] => [
    { token: TOKEN, code: "SBC-801", section: "903.2.7", status, score: 1, reasons },
  ];

  it("renders exactly as before when the message carries no verdicts", () => {
    const before = applyInlineMarkdown(TOKEN, "standard");
    const withEmpty = applyInlineMarkdown(TOKEN, "standard", undefined, buildCitationStatusIndex([]));
    expect(withEmpty).toBe(before);
    expect(before).not.toContain("cx-cite-badge");
  });

  it("badges a verified token green and keeps the chip clickable", () => {
    const html = applyInlineMarkdown(TOKEN, "standard", undefined, buildCitationStatusIndex(statusItem("verified", ["quote_verbatim"])));
    expect(html).toContain("cx-cite-badge");
    expect(html).toContain('data-cite-status="verified"');
    expect(html).toContain("مُتحقق");
    expect(html).toContain("الاقتباس مطابق للنص المسترجع");
    expect(html).toContain('data-src="sbc801"');
    expect(html).toContain('data-section="903.2.7"');
  });

  it("badges paraphrased and unverified with their own labels", () => {
    const para = applyInlineMarkdown(TOKEN, "standard", undefined, buildCitationStatusIndex(statusItem("paraphrased")));
    expect(para).toContain("معاد صياغته");
    const unver = applyInlineMarkdown(
      TOKEN, "standard", undefined,
      buildCitationStatusIndex(statusItem("unverified", ["code_family_mismatch:SBC-501"])),
    );
    expect(unver).toContain("غير مُتحقق");
    expect(unver).toContain("SBC-501");
  });

  it("uses margin-inline-start so the badge sits correctly in RTL", () => {
    const html = applyInlineMarkdown(TOKEN, "standard", undefined, buildCitationStatusIndex(statusItem("verified")));
    expect(html).toContain("margin-inline-start");
  });

  it("matches a verdict through the code+section fallback key when the token text differs", () => {
    const index = buildCitationStatusIndex([
      { token: "[SBC-801 Section 903.2.7 | conf:medium]", code: "SBC-801", section: "903.2.7", status: "unverified", reasons: [] },
    ]);
    const html = applyInlineMarkdown("[SBC 801 Section 903.2.7 | conf:high]", "standard", undefined, index);
    expect(html).toContain('data-cite-status="unverified"');
  });

  it("leaves a token with no matching verdict unbadged", () => {
    const index = buildCitationStatusIndex(statusItem("verified"));
    const html = applyInlineMarkdown("[SBC-201 Section 1017.2 | conf:high]", "standard", undefined, index);
    expect(html).not.toContain("cx-cite-badge");
  });

  it("buildCitationStatusIndex returns undefined for empty or absent input", () => {
    expect(buildCitationStatusIndex(undefined)).toBeUndefined();
    expect(buildCitationStatusIndex([])).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. index.ts source contract (index.ts is read, never imported)
// ─────────────────────────────────────────────────────────────────────────────

describe("index.ts wiring (source contract — does not execute the Edge Function)", () => {
  const FLAG = 'CITATION_VERIFIER_ENABLED';
  const TRANSFORM_DONE = 'new TextEncoder().encode("data: [DONE]\\n\\n")';
  const FINAL_DONE = 'sseEncoder.encode("data: [DONE]\\n\\n")';

  it("reads the flag as the exact string \"1\", like the other flags in the file", () => {
    expect(INDEX_SRC).toContain(FLAG);
    expect(INDEX_SRC).toMatch(
      new RegExp(`Deno\\.env\\.get\\("${FLAG}"\\)[^\\n]*===\\s*"1"`),
    );
  });

  it("keeps BOTH original [DONE] emission sites inside transformStream (flag-OFF path)", () => {
    expect(countOccurrences(INDEX_SRC, TRANSFORM_DONE)).toBe(2);
  });

  it("gates each transformStream [DONE] on the verifier being OFF", () => {
    expect(INDEX_SRC).toContain('finishReason === "STOP" && !citationVerifierOn');
    expect(INDEX_SRC).toContain("if (!citationVerifierOn) {");
  });

  it("emits the citations event exactly once", () => {
    expect(countOccurrences(INDEX_SRC, 'type: "citations"')).toBe(1);
  });

  it("emits the citations event BEFORE the single final [DONE] (flag-ON path)", () => {
    expect(countOccurrences(INDEX_SRC, FINAL_DONE)).toBe(1);
    const citationsAt = INDEX_SRC.indexOf('type: "citations"');
    const finalDoneAt = INDEX_SRC.indexOf(FINAL_DONE);
    expect(citationsAt).toBeGreaterThan(-1);
    expect(finalDoneAt).toBeGreaterThan(-1);
    expect(citationsAt).toBeLessThan(finalDoneAt);
  });

  it("keeps the Gemini pipe open when the verifier owns the stream tail", () => {
    expect(INDEX_SRC).toContain("preventClose: true");
    expect(INDEX_SRC).toContain("pipeTo(earlyTs.writable)");
  });

  it("logs one [Citations] line with the three counters", () => {
    // The template literal is wrapped across two source lines, so the counters
    // are matched with a newline-tolerant, bounded pattern.
    expect(INDEX_SRC).toMatch(
      /\[Citations\] mode=[\s\S]{0,160}verified=[\s\S]{0,160}paraphrased=[\s\S]{0,160}unverified=/,
    );
  });

  it("imports the verifier from its own module", () => {
    expect(INDEX_SRC).toMatch(/from "\.\/citationVerifier\.ts"/);
  });
});
