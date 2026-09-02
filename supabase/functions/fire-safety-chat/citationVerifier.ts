/**
 * Runtime citation verifier (B1a).
 *
 * Every inline citation token the model emits is checked against the evidence
 * that was actually retrieved for THIS request, before the client is allowed to
 * treat the token as a citation. A token that cannot be tied back to retrieved
 * text is reported as such instead of being rendered as an authoritative chip.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MODULE EXISTS
 * ---------------------------------------------------------------------------
 * promptContract.ts CITATION_TOKEN_CONTRACT tells the model to copy the code
 * and section number out of the retrieved chunk header it took the text from.
 * That is an instruction, not an enforcement: nothing downstream ever compared
 * the emitted token against the chunks. The three failure shapes that instruc-
 * tion exists to prevent are exactly the three checks below:
 *   (a) quote check   — the quoted sentence is really in a retrieved chunk;
 *   (b) section check — the cited section number exists in the evidence (or in
 *                       the code's section index);
 *   (c) family check  — the token's code is the code of the chunk the quote
 *                       actually came from (the SBC 501 duct rule cited as
 *                       SBC-201 incident named in index.ts's context builder).
 *
 * ---------------------------------------------------------------------------
 * PURITY CONTRACT
 * ---------------------------------------------------------------------------
 * No Deno global is touched at import time, so vitest can import this module
 * directly (same discipline as ./promptContract.ts and ./retrievalPolicy.ts).
 * loadKnownSections() takes the Supabase admin client as a parameter rather
 * than building one, and the CITATION_VERIFIER_ENABLED flag is resolved by
 * index.ts, never here.
 *
 * The token grammar below MIRRORS src/utils/inlineCitation.ts
 * parseCitationToken(). It is duplicated rather than imported because an Edge
 * Function cannot import from the Vite frontend tree; src/__tests__/
 * citationVerifier.test.ts asserts the two parsers agree on the contract's
 * sample tokens, so drift fails a test instead of silently disabling
 * verification. codeFromFileName's logic is duplicated from index.ts for the
 * same reason (index.ts calls serve() at module top level and cannot be
 * imported).
 */

// ==================== PUBLIC TYPES ====================

export type CitationStatus = "verified" | "paraphrased" | "unverified";

/** One retrieved evidence chunk. `code` is the hyphenated form ("SBC-801"). */
export interface VerifierChunk {
  code: string;
  section?: string;
  page?: number;
  content: string;
  fileName: string;
}

export interface CitationVerdict {
  /** The token exactly as it appeared in the answer, brackets included. */
  token: string;
  code: string;
  section: string | null;
  page: number | null;
  quote: string | null;
  status: CitationStatus;
  /** Best quote similarity found, 0..1. 0 when no quote could be located. */
  score: number;
  /** Stable machine codes; the client maps them to Arabic. */
  reasons: string[];
}

export interface CitationSummary {
  verified: number;
  paraphrased: number;
  unverified: number;
}

export interface VerifyResult {
  items: CitationVerdict[];
  summary: CitationSummary;
}

export interface VerifyOptions {
  /** code -> every section number known to exist for that code. */
  knownSections?: Map<string, Set<string>>;
  /** Hard cap on tokens examined (cost guard). Default 60. */
  maxTokens?: number;
}

// ==================== CONSTANTS ====================

export const VERIFIED_THRESHOLD = 0.9;
export const PARAPHRASED_THRESHOLD = 0.6;
export const DEFAULT_MAX_TOKENS = 60;

/** Longest quote (normalized chars) compared; longer quotes are truncated. */
const MAX_QUOTE_CHARS = 400;
/** Shortest quote worth scoring — below this, bigram similarity is noise. */
const MIN_QUOTE_CHARS = 12;
/** How far back from a token to look for the quotation it is attached to. */
const QUOTE_LOOKBACK_CHARS = 800;
/** Total window shifts allowed per token across all chunks. */
const WINDOW_SHIFT_BUDGET = 250_000;

const KNOWN_CODES = ["SBC-201", "SBC-801", "SBC-501", "SBC-401"] as const;

// ==================== TOKEN GRAMMAR (mirrors src/utils/inlineCitation.ts) ====

const TOKEN_SCAN_RX = /\[[^[\]\n]{0,300}\]/g;
const TOKEN_CODE_RX = /SBC[\s ‑\-_]*(201|801|501|401)/i;
const TOKEN_SECTION_RX = /Section\s+(\d{3,4}(?:\.\d{1,3}){0,3})/i;
const TOKEN_TABLE_RX = /Table\s+(\d{3,4}(?:\.\d{1,3}){0,3})/i;
const TOKEN_PP_RX = /pp\.?\s*(\d+)[-–](\d+)/i;

/** "SBC201" / "SBC 201" / "sbc-201" -> "SBC-201"; anything else -> "UNKNOWN". */
export function normalizeCode(raw: string | null | undefined): string {
  const m = String(raw ?? "").match(TOKEN_CODE_RX);
  return m ? `SBC-${m[1]}` : "UNKNOWN";
}

/** Owning code of a chunk, from its storage filename. Mirrors index.ts codeFromFileName. */
export function codeFromFile(fileName: string | null | undefined): string {
  const f = String(fileName ?? "");
  if (/^SBC[\s_-]*201\b/i.test(f)) return "SBC-201";
  if (/^SBC[\s_-]*801\b/i.test(f)) return "SBC-801";
  if (/^SBC[\s_-]*501(?!\d)/i.test(f)) return "SBC-501";
  if (/^SBC[\s_-]*401(?!\d)/i.test(f)) return "SBC-401";
  return "UNKNOWN";
}

interface TokenHit {
  token: string;
  index: number;
  code: string;
  section: string | null;
  page: number | null;
}

/** Every citation token in the answer, in order of appearance. */
export function extractCitationTokens(answerText: string): TokenHit[] {
  const out: TokenHit[] = [];
  if (!answerText) return out;
  const rx = new RegExp(TOKEN_SCAN_RX.source, "g");
  let m: RegExpExecArray | null;
  while ((m = rx.exec(answerText)) !== null) {
    const token = m[0];
    const inner = token.slice(1, -1);
    if (!TOKEN_CODE_RX.test(inner)) continue;
    const sec = inner.match(TOKEN_SECTION_RX)?.[1] ?? inner.match(TOKEN_TABLE_RX)?.[1] ?? null;
    const pp = inner.match(TOKEN_PP_RX);
    out.push({
      token,
      index: m.index,
      code: normalizeCode(inner),
      section: sec,
      page: pp ? parseInt(pp[1], 10) : null,
    });
  }
  return out;
}

// ==================== TEXT NORMALIZATION ====================

// Arabic marks (fathatan..sukun), superscript alef, tatweel, and the Quranic
// range — all invisible to meaning for a quote-identity comparison.
const AR_MARKS_RX = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const BIDI_RX = /[​-‏‪-‮⁦-⁩﻿]/g;
const FANCY_QUOTES_RX = /[“”„‘’«»]/g;

/**
 * Fold away every difference that does not change what the text SAYS:
 * Arabic diacritics and tatweel, alef/ya/ta-marbuta spelling variants, bidi
 * controls, curly quotes, Latin case, and whitespace runs.
 */
export function normalizeForCompare(s: string): string {
  return String(s ?? "")
    .replace(AR_MARKS_RX, "")
    .replace(BIDI_RX, "")
    .replace(/[آأإٱٲٳ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(FANCY_QUOTES_RX, '"')
    .replace(/[‐-―]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ==================== SIMILARITY (character-bigram Dice) ====================

function bigramCounts(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i + 1 < s.length; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function diceOf(
  a: Map<string, number>, aTotal: number,
  b: Map<string, number>, bTotal: number,
): number {
  if (aTotal <= 0 || bTotal <= 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const [g, n] of small) {
    const o = large.get(g);
    if (o !== undefined) inter += Math.min(n, o);
  }
  return (2 * inter) / (aTotal + bTotal);
}

/**
 * Best Dice score between `quote` and any equal-length window of `content`.
 *
 * The window slides one character at a time — a coarser step would misalign a
 * genuinely verbatim quote and score it in the paraphrase band. Step-1 is
 * affordable because the window's bigram counts AND its intersection with the
 * quote are both maintained incrementally, so each shift is O(1) rather than
 * O(quote length). `budget` bounds the total shifts across all chunks for one
 * token so a pathological answer cannot stall the stream tail.
 */
function bestWindowDice(quoteNorm: string, contentNorm: string, budget: { left: number }): number {
  const L = quoteNorm.length;
  if (L < 2 || contentNorm.length < 2) return 0;
  if (contentNorm.includes(quoteNorm)) return 1;

  const q = bigramCounts(quoteNorm);
  const qTotal = L - 1;
  if (contentNorm.length <= L) {
    return diceOf(q, qTotal, bigramCounts(contentNorm), contentNorm.length - 1);
  }

  const win = L;
  const wTotal = win - 1;
  const w = new Map<string, number>();
  let inter = 0;
  const addGram = (g: string) => {
    const c = w.get(g) ?? 0;
    w.set(g, c + 1);
    if (c < (q.get(g) ?? 0)) inter++;
  };
  const dropGram = (g: string) => {
    const c = w.get(g) ?? 0;
    if (c <= 0) return;
    if (c <= (q.get(g) ?? 0)) inter--;
    if (c === 1) w.delete(g);
    else w.set(g, c - 1);
  };

  for (let i = 0; i + 1 < win; i++) addGram(contentNorm.slice(i, i + 2));
  let best = (2 * inter) / (qTotal + wTotal);

  const last = contentNorm.length - win;
  for (let start = 1; start <= last; start++) {
    if (budget.left-- <= 0) break;
    dropGram(contentNorm.slice(start - 1, start + 1));
    addGram(contentNorm.slice(start + win - 2, start + win));
    const sc = (2 * inter) / (qTotal + wTotal);
    if (sc > best) {
      best = sc;
      if (best >= 0.999) break;
    }
  }
  return best;
}

// ==================== QUOTE LOCATION ====================

/**
 * The quotation a token is attached to.
 *
 * CORE_RULES rule 3 requires the verbatim English quotation to precede the
 * claim, and CITATION_TOKEN_CONTRACT puts the token at the END of the
 * sentence that makes the claim — so the quote is looked for BEHIND the
 * token, nearest first, inside a bounded window.
 */
export function findQuoteForToken(answerText: string, tokenIndex: number): string | null {
  const from = Math.max(0, tokenIndex - QUOTE_LOOKBACK_CHARS);
  const segment = answerText.slice(from, tokenIndex);
  const rx = /"([^"\n]{10,400})"|“([^”\n]{10,400})”|«([^»\n]{10,400})»/g;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(segment)) !== null) {
    const q = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (q) last = q;
  }
  if (last) return last;

  // Markdown blockquote fallback: the answer structures put the English quote
  // on its own "> ..." line above the analysis.
  const lines = segment.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith(">")) {
      const body = line.replace(/^>+\s*/, "").trim();
      if (body.length >= MIN_QUOTE_CHARS) return body;
    }
  }
  return null;
}

// ==================== CHUNK PARSING ====================

const CHUNK_HEADER_RX = /^=== (.*?) ===$/gm;

/**
 * Recover per-chunk evidence from the assembled context string.
 *
 * index.ts builds the context in three shapes and all three are handled:
 *   vector  : "=== <file> | Code: SBC-501 | Section: 507.2 | Pages: 12-14 | Similarity: 0.81 ==="
 *   keyword : "=== <file> (3 relevant sections) ==="
 *   storage : "=== <file> ==="
 * Only the vector shape states the code and section explicitly; for the other
 * two the code is derived from the filename and the section is left unset,
 * which downgrades — never fabricates — a verdict.
 */
export function parseRetrievedChunks(context: string): VerifierChunk[] {
  const out: VerifierChunk[] = [];
  if (!context) return out;
  const rx = new RegExp(CHUNK_HEADER_RX.source, "gm");
  const heads: Array<{ header: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(context)) !== null) {
    heads.push({ header: m[1], start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < heads.length; i++) {
    const content = context.slice(heads[i].end, i + 1 < heads.length ? heads[i + 1].start : context.length).trim();
    if (!content) continue; // banner lines carry no body
    const fields = heads[i].header.split("|").map((p) => p.trim());
    const fileName = fields[0].replace(/\s*\(\d+\s+relevant sections\)\s*$/i, "").trim();
    let code = "";
    let section: string | undefined;
    let page: number | undefined;
    for (const f of fields.slice(1)) {
      const codeM = f.match(/^Code:\s*(.+)$/i);
      if (codeM) code = normalizeCode(codeM[1]);
      const secM = f.match(/^Section:\s*(.+)$/i);
      if (secM && secM[1].trim() && secM[1].trim().toUpperCase() !== "N/A") section = secM[1].trim();
      const pageM = f.match(/^Pages:\s*(\d+)/i);
      if (pageM) page = parseInt(pageM[1], 10);
    }
    if (!code || code === "UNKNOWN") code = codeFromFile(fileName);
    out.push({ code, section, page, content, fileName });
  }
  return out;
}

// ==================== KNOWN-SECTION INDEX ====================

interface SectionCacheEntry {
  sections: Set<string>;
  loadedAt: number;
}
const KNOWN_SECTION_TTL_MS = 60 * 60 * 1000;
const knownSectionCache = new Map<string, SectionCacheEntry>();

/** Test seam — drops the module-level cache. */
export function resetKnownSectionCache(): void {
  knownSectionCache.clear();
}

/** Minimal shape of the Supabase admin client this module needs. */
export type SectionIndexClient = { from: (table: string) => any };

/**
 * DISTINCT section_number per code, cached for an hour and FAIL-OPEN.
 *
 * Any error, and any code that is not one of the four known codes, yields an
 * empty set: the verifier then falls back to "the section must appear in the
 * retrieved chunks", which is stricter, never looser. PostgREST has no DISTINCT,
 * so the dedupe happens here; sbc_documents.section_number is indexed and the
 * result is cached, so this is one cheap query per code per hour per isolate.
 */
export async function loadKnownSections(
  client: SectionIndexClient,
  codes: string[],
  now: number = Date.now(),
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  const wanted = [...new Set(codes.map((c) => normalizeCode(c)))].filter(
    (c) => (KNOWN_CODES as readonly string[]).includes(c),
  );
  for (const code of wanted) {
    const cached = knownSectionCache.get(code);
    if (cached && now - cached.loadedAt < KNOWN_SECTION_TTL_MS) {
      result.set(code, cached.sections);
      continue;
    }
    const sections = new Set<string>();
    try {
      // sbc_documents.code_type is stored unhyphenated ("SBC201").
      const { data, error } = await client
        .from("sbc_documents")
        .select("section_number")
        .eq("code_type", code.replace("-", ""))
        .not("section_number", "is", null)
        .limit(20000);
      if (!error && Array.isArray(data)) {
        for (const row of data as Array<{ section_number: string | null }>) {
          const s = String(row?.section_number ?? "").trim();
          if (s) sections.add(s);
        }
      }
    } catch {
      /* fail-open: an empty set means "verify against retrieved chunks only" */
    }
    knownSectionCache.set(code, { sections, loadedAt: now });
    result.set(code, sections);
  }
  return result;
}

// ==================== VERIFICATION ====================

function sameSection(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().replace(/\.+$/, "") === b.trim().replace(/\.+$/, "");
}

function statusRank(s: CitationStatus): number {
  return s === "verified" ? 2 : s === "paraphrased" ? 1 : 0;
}

/**
 * Verify every citation token in `answerText` against `chunks`.
 *
 * Status rules:
 *   quote similarity >= 0.90                          -> verified
 *   quote similarity in [0.60, 0.90)                  -> paraphrased
 *   quote similarity < 0.60                           -> unverified
 *   cited section absent from evidence AND from index -> unverified
 *   quote matched a chunk of a DIFFERENT code         -> unverified
 *
 * A token with NO locatable quotation cannot reach "verified": it lands on
 * "paraphrased" when its section is anchored in the same-code evidence, and on
 * "unverified" otherwise. That is deliberate — an Arabic answer often states
 * the requirement in Arabic without re-quoting, and marking every such token
 * red would make the badge noise rather than a signal, while marking it green
 * would claim a verification that never happened.
 */
export function verifyCitations(
  answerText: string,
  chunks: VerifierChunk[],
  options: VerifyOptions = {},
): VerifyResult {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const hits = extractCitationTokens(answerText ?? "").slice(0, Math.max(0, maxTokens));

  const safeChunks = (chunks ?? []).filter((c) => c && typeof c.content === "string" && c.content.length > 0);
  const normalizedChunks = safeChunks.map((c) => ({
    code: normalizeCode(c.code) === "UNKNOWN" ? codeFromFile(c.fileName) : normalizeCode(c.code),
    section: c.section,
    content: normalizeForCompare(c.content),
    raw: c,
  }));

  const byToken = new Map<string, CitationVerdict>();

  for (const hit of hits) {
    const reasons: string[] = [];
    const rawQuote = findQuoteForToken(answerText, hit.index);
    const quoteNorm = rawQuote ? normalizeForCompare(rawQuote).slice(0, MAX_QUOTE_CHARS) : "";
    const usableQuote = quoteNorm.length >= MIN_QUOTE_CHARS;

    const sameCode = normalizedChunks.filter((c) => c.code === hit.code);
    if (sameCode.length === 0) reasons.push("no_evidence_for_code");

    // (a) quote check, same code only.
    const budget = { left: WINDOW_SHIFT_BUDGET };
    let score = 0;
    if (usableQuote) {
      for (const c of sameCode) {
        const s = bestWindowDice(quoteNorm, c.content, budget);
        if (s > score) score = s;
        if (score >= 0.999) break;
      }
      reasons.push(
        score >= VERIFIED_THRESHOLD ? "quote_verbatim"
          : score >= PARAPHRASED_THRESHOLD ? "quote_paraphrased"
            : "quote_not_in_evidence",
      );
    } else {
      reasons.push(rawQuote ? "quote_too_short" : "no_quote_found");
    }

    // (c) family check — only worth paying for when the same-code evidence did
    // not already carry the quote verbatim.
    let familyMismatch = false;
    if (usableQuote && score < VERIFIED_THRESHOLD) {
      const otherBudget = { left: WINDOW_SHIFT_BUDGET };
      let otherBest = 0;
      let otherCode = "";
      for (const c of normalizedChunks) {
        if (c.code === hit.code) continue;
        const s = bestWindowDice(quoteNorm, c.content, otherBudget);
        if (s > otherBest) {
          otherBest = s;
          otherCode = c.code;
        }
        if (otherBest >= 0.999) break;
      }
      if (otherBest >= PARAPHRASED_THRESHOLD && otherBest > score + 0.05) {
        familyMismatch = true;
        reasons.push(`code_family_mismatch:${otherCode}`);
      }
    }

    // (b) section existence.
    let sectionAnchored: false | "evidence" | "index" | null = null;
    if (hit.section) {
      if (sameCode.some((c) => sameSection(c.section, hit.section))) {
        sectionAnchored = "evidence";
      } else if (options.knownSections?.get(hit.code)?.has(hit.section.trim())) {
        sectionAnchored = "index";
        reasons.push("section_from_known_index");
      } else {
        sectionAnchored = false;
        reasons.push("section_missing_from_evidence");
      }
    } else {
      reasons.push("page_only_token");
    }

    let status: CitationStatus;
    if (familyMismatch || sectionAnchored === false) {
      status = "unverified";
    } else if (!usableQuote) {
      status = sectionAnchored ? "paraphrased" : "unverified";
    } else if (score >= VERIFIED_THRESHOLD) {
      status = "verified";
    } else if (score >= PARAPHRASED_THRESHOLD) {
      status = "paraphrased";
    } else {
      status = "unverified";
    }

    const verdict: CitationVerdict = {
      token: hit.token,
      code: hit.code,
      section: hit.section,
      page: hit.page,
      quote: rawQuote,
      status,
      score: Math.round(score * 1000) / 1000,
      reasons,
    };

    // The same token repeated in one answer collapses to its best occurrence:
    // the client keys badges by token text, so one token must have one verdict.
    const prev = byToken.get(hit.token);
    if (!prev || statusRank(status) > statusRank(prev.status) ||
      (statusRank(status) === statusRank(prev.status) && verdict.score > prev.score)) {
      byToken.set(hit.token, verdict);
    }
  }

  const items = [...byToken.values()];
  const summary: CitationSummary = { verified: 0, paraphrased: 0, unverified: 0 };
  for (const it of items) summary[it.status]++;
  return { items, summary };
}
