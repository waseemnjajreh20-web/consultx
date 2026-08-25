/**
 * Context budget for fire-safety-chat's advisory/analysis TEXT prompt
 * assembly: a deterministic, priority-ordered clamp so structured tables +
 * SBC document context + user-uploaded document text can no longer silently
 * stack past the model's context budget.
 *
 * Pure data + pure logic (no Deno APIs, no I/O) so it can be unit-tested from
 * src/__tests__ and imported safely by the Edge Function — the same pattern
 * as ./retrievalPolicy.ts, ./chapterIndex.ts and ./promptContract.ts.
 *
 * Created 2026-08-25 (P2) alongside the analysis-mode vector rollout: a wider
 * retrieval surface (25 matches for analysis text, same as standard) makes it
 * easier for tables + sbcContext + docBlocks to add up past what previously
 * fit by construction. Before this module, nothing enforced a combined cap on
 * the assembled prompt; each piece was truncated on its own (sbcContext at
 * 120,000 chars inside fetchSBCContextVector, each doc block at 8,000 chars)
 * but nothing capped their SUM.
 */

/**
 * Must equal MAX_TOTAL_CONTEXT in index.ts (currently declared there as
 * `const MAX_TOTAL_CONTEXT = 120000;`, the limit fetchSBCContext already
 * assembles keyword-path context against). Kept as a separate constant here
 * — rather than importing across the Deno/Node boundary — because this
 * module must stay pure and importable from vitest; the two are asserted
 * equal by a test (src/__tests__/contextBudget.test.ts) so they cannot drift
 * silently.
 */
export const TOTAL_CONTEXT_CAP = 120000;

/**
 * Appended to whichever piece gets truncated (a doc block or sbcContext) so
 * the model — and anyone reading the assembled prompt — can see budget
 * truncation happened rather than mistaking a cut for the end of the source.
 */
export const TRUNCATION_MARKER = "\n[TRUNCATED: context budget reached]";

export interface AssembledContextParts {
  tableBlock: string;
  sbcContext: string;
  docBlocks: string[];
}

export interface ClampedContext {
  tableBlock: string;
  sbcContext: string;
  docBlocks: string[];
  /** Sum of the returned pieces' lengths (after any truncation). */
  totalChars: number;
  /** True only when the input total exceeded the cap and something was cut. */
  truncated: boolean;
  /** Count of docBlocks entries removed entirely (not counting the one
   *  boundary block that was partially truncated and kept). */
  droppedDocBlocks: number;
}

/**
 * Clamp an assembled prompt's three pieces to `cap` total characters.
 *
 * Contract:
 *  - when tableBlock.length + sbcContext.length + sum(docBlocks) <= cap, the
 *    inputs are returned COMPLETELY UNCHANGED — same string values, same
 *    docBlocks array reference — so under-cap requests (the common case
 *    today) are byte-identical to HEAD, which never clamped anything.
 *  - tableBlock is NEVER modified, truncated, or dropped. It holds a
 *    handful of transcribed code-table rows and is safety-critical; it is
 *    intentionally excluded from the budget fight.
 *  - priority, lowest first: docBlocks (dropped/truncated from the END of
 *    the array), then sbcContext (truncated from its own end, but only once
 *    every docBlock has already been dropped or the boundary block
 *    truncated). tableBlock always survives whole, per above.
 *  - docBlocks are dropped whole, from the end, for as many as don't fit;
 *    the one boundary block that partially fits is partial-truncated with
 *    TRUNCATION_MARKER appended, rather than dropped outright, whenever
 *    there is any room left for it. Every block after the boundary block is
 *    dropped too — the cut is a single tail, not a scattered selection.
 *  - if, after dropping every docBlock, tableBlock + sbcContext is still
 *    over cap, sbcContext itself is truncated from its end with the same
 *    marker appended.
 *  - deterministic: the same input always produces the same output; there is
 *    no randomness or ordering dependency beyond the arrays' own order.
 *  - a cap of Number.POSITIVE_INFINITY is an exact identity pass-through: no
 *    input can exceed it, so the first branch below returns everything
 *    unchanged. index.ts passes it on the non-vector (flag-OFF) path so the
 *    clamp can be disabled without a second assembly code path.
 *  - tableBlock's immunity outranks the cap. If tableBlock alone is at or over
 *    cap there is no room left for anything else, so a non-empty sbcContext
 *    collapses to TRUNCATION_MARKER and every docBlock is dropped — and the
 *    returned totalChars is then LARGER than cap. That is deliberate: the
 *    alternative is silently discarding safety-critical table rows.
 */
export function clampAssembledContext(
  parts: AssembledContextParts,
  cap: number = TOTAL_CONTEXT_CAP,
): ClampedContext {
  const { tableBlock, sbcContext, docBlocks } = parts;
  const docBlocksTotal = docBlocks.reduce((sum, b) => sum + b.length, 0);
  const originalTotal = tableBlock.length + sbcContext.length + docBlocksTotal;

  // Common case: everything already fits. Return the inputs unchanged.
  if (originalTotal <= cap) {
    return {
      tableBlock,
      sbcContext,
      docBlocks,
      totalChars: originalTotal,
      truncated: false,
      droppedDocBlocks: 0,
    };
  }

  // Over cap. tableBlock is untouchable, so everything else competes for
  // whatever room is left after it.
  const budgetForRest = Math.max(0, cap - tableBlock.length);

  // sbcContext outranks docBlocks: it stays whole unless there is not even
  // enough room for it once docBlocks are entirely gone.
  let finalSbcContext = sbcContext;
  let docBudget: number;
  if (sbcContext.length > budgetForRest) {
    // No room for sbcContext to survive whole -> no room for any docBlocks
    // either. Truncate sbcContext itself from its end.
    const keepLen = Math.max(0, budgetForRest - TRUNCATION_MARKER.length);
    finalSbcContext = keepLen > 0 ? sbcContext.slice(0, keepLen) + TRUNCATION_MARKER : TRUNCATION_MARKER;
    docBudget = 0;
  } else {
    docBudget = budgetForRest - sbcContext.length;
  }

  // Walk docBlocks front-to-back, keeping whole blocks while they fit. The
  // first block that does not fully fit is the boundary block: partial-
  // truncate it (with the marker) if any room remains, otherwise drop it.
  // Every block after the boundary is dropped too, so the cut is always a
  // single contiguous tail — equivalent to "drop from the end."
  const keptDocBlocks: string[] = [];
  let usedDocBudget = 0;
  let boundaryHit = false;

  for (const block of docBlocks) {
    if (boundaryHit) continue;
    const remaining = docBudget - usedDocBudget;
    if (remaining <= 0) {
      boundaryHit = true;
      continue;
    }
    if (block.length <= remaining) {
      keptDocBlocks.push(block);
      usedDocBudget += block.length;
      continue;
    }
    const keepLen = Math.max(0, remaining - TRUNCATION_MARKER.length);
    if (keepLen > 0) {
      const truncatedBlock = block.slice(0, keepLen) + TRUNCATION_MARKER;
      keptDocBlocks.push(truncatedBlock);
      usedDocBudget += truncatedBlock.length;
    }
    boundaryHit = true;
  }

  const droppedDocBlocks = docBlocks.length - keptDocBlocks.length;
  const totalChars = tableBlock.length + finalSbcContext.length + usedDocBudget;

  return {
    tableBlock,
    sbcContext: finalSbcContext,
    docBlocks: keptDocBlocks,
    totalChars,
    truncated: true,
    droppedDocBlocks,
  };
}
