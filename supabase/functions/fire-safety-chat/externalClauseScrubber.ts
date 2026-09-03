/**
 * externalClauseScrubber — structural enforcement of SOURCE_SCOPE rule 3.
 *
 * The system prompt forbids inventing clause/table/page numbers of standards
 * ConsultX does not hold (NFPA, SFPE, IBC, IFC, ASTM, UL, ...). The model still
 * does it in a minority of sprinkler answers — measured on every live bench
 * since 2026-08-29 (ADV-031/032, both modes): the retrieved SBC text names
 * "NFPA 13", the model appends a section number from its own memory. A prompt
 * rule cannot make that impossible; this stream transform can.
 *
 * Behaviour: a clause reference attached to an ABSENT standard is reduced to
 * the bare standard name exactly as the SBC text carries it — "NFPA 13
 * القسم 8.15.1" → "NFPA 13", "Section 5.2 of NFPA 72" → "NFPA 72". Nothing
 * else in the text changes. SBC references (SBC 801 Section 903.2) are never
 * touched because SBC is not an absent standard.
 *
 * Streaming: a reference is only scrubbed once the text AFTER its clause
 * number has arrived (a trailing "8." could still become "8.15.1"), and the
 * scrubber holds a short unflushed tail so a reference split across deltas is
 * seen whole; flush() settles and releases the tail.
 */

export const ABSENT_STANDARDS = ["NFPA", "SFPE", "IBC", "IFC", "ASTM", "UL", "ISO", "BS", "EN"] as const;

const STD = String.raw`(?:${ABSENT_STANDARDS.join("|")})`;
const STD_WITH_NUMBER = String.raw`${STD}\s*[-–]?\s*\d{1,5}[A-Z]?`;
const CLAUSE_WORD = String.raw`(?:Section|Sec\.|Clause|Table|Chapter|Article|Paragraph|Para\.|القسم|البند|الفقرة|الجدول|الفصل|المادة|بند|فقرة|جدول|قسم)`;
const CLAUSE_NUM = String.raw`\d+(?:\.\d+)*(?:\([a-z0-9]+\))?`;

// A clause number is "settled" only when followed by a character that cannot
// extend it. In streaming (final=false) end-of-buffer does NOT count.
function build(final: boolean) {
  const after = final ? String.raw`(?=[^\d.]|$)` : String.raw`(?=[^\d.])`;
  // "NFPA 13 Section 8.15.1" / "NFPA 13 القسم 8.15" / "NFPA 13, Table 11.2.3.1.1" / "NFPA 13 (8.15.1)"
  const forward = new RegExp(
    String.raw`(${STD_WITH_NUMBER})\s*[,:،\-–]?\s*(?:${CLAUSE_WORD}\s*${CLAUSE_NUM}${after}|\(\s*${CLAUSE_NUM}\s*\))`,
    "g",
  );
  // "Section 8.15.1 of NFPA 13" / "القسم 8.15.1 من NFPA 13" / "الجدول 11.2 في NFPA 13"
  const backward = new RegExp(
    String.raw`${CLAUSE_WORD}\s*${CLAUSE_NUM}\s*(?:of|in|from|من|في|وفق|حسب|بحسب)\s*(${STD_WITH_NUMBER})${after}`,
    "g",
  );
  return { forward, backward };
}
const FINAL = build(true);
const STREAM = build(false);

/** Longest text a split reference can span; the stream keeps this much unflushed. */
export const SCRUB_TAIL_CHARS = 64;

export interface ScrubResult {
  text: string;
  /** Number of external clause references reduced to the bare standard name. */
  scrubbed: number;
}

export function scrubExternalClauses(text: string, opts: { final?: boolean } = {}): ScrubResult {
  const rx = opts.final === false ? STREAM : FINAL;
  let scrubbed = 0;
  let out = text.replace(rx.forward, (_m, std: string) => { scrubbed++; return std.trim(); });
  out = out.replace(rx.backward, (_m, std: string) => { scrubbed++; return std.trim(); });
  return { text: out, scrubbed };
}

/**
 * Incremental scrubber for a delta stream. Feed deltas with push(); each call
 * returns the text safe to forward now. Call flush() at the end.
 */
export function createStreamScrubber() {
  let pending = "";
  let scrubbedTotal = 0;
  return {
    push(delta: string): string {
      pending += delta;
      const { text, scrubbed } = scrubExternalClauses(pending, { final: false });
      scrubbedTotal += scrubbed;
      if (text.length <= SCRUB_TAIL_CHARS) { pending = text; return ""; }
      const cut = text.length - SCRUB_TAIL_CHARS;
      pending = text.slice(cut);
      return text.slice(0, cut);
    },
    flush(): string {
      const { text, scrubbed } = scrubExternalClauses(pending, { final: true });
      scrubbedTotal += scrubbed;
      pending = "";
      return text;
    },
    get scrubbed(): number { return scrubbedTotal; },
  };
}
