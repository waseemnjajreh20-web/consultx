/**
 * workflow_constraints.ts
 *
 * Evidence augmentation for Advisory mode.
 * Enriches retrieval context with B1 workflow hints and enforces
 * safe-answer constraints as system-prompt overlays.
 *
 * FEATURE FLAG: ADVISORY_BRAIN_B2_EVIDENCE_ENABLED
 *   - "1"  → augment retrieval; inject workflow constraint overlay into prompt
 *   - anything else → return null; no behavior change
 *
 * RULES:
 *   - Does NOT replace existing chunk retrieval (bucket fetch continues unchanged)
 *   - Adds semantic hints (which sections/tables to prioritize)
 *   - Adds parking-lot warnings (which refs are not in V4)
 *   - Adds safe-answer rule overlay into system prompt (Advisory only)
 *   - Orphans: never used as standalone evidence
 *   - Parking-lot: acknowledged explicitly, never passed as available text
 *   - SBC201 / SBC801 families: never mixed
 *
 * Advisory-only. Never invoked for Main (primary) or Analytical (analysis) modes.
 */

import type {
  AdvisoryBrainB1,
  RouterResult,
  AugmentationResult,
  EvidenceHint,
  ParkingLotRef,
  BrainOrphanNode,
  AdvisoryWorkflow,
} from "./brain_b1_types.ts";

// ── Feature flag ──────────────────────────────────────────────────────────────

export function isEvidenceEnabled(): boolean {
  return Deno.env.get("ADVISORY_BRAIN_B2_EVIDENCE_ENABLED") === "1";
}

// ── Build augmentation result ─────────────────────────────────────────────────

export function augmentWithWorkflow(
  routerResult: RouterResult | null,
  brain: AdvisoryBrainB1 | null,
  userQuery: string,
  conversationContext: string[] = [],
): AugmentationResult | null {
  if (!isEvidenceEnabled()) return null;
  if (!routerResult || !brain) return null;
  if (routerResult.domain === "non_code") return null;

  const wf: AdvisoryWorkflow | null = routerResult.workflow;
  const hints: EvidenceHint[] = [];
  const parking_lot_warnings: ParkingLotRef[] = [];

  // 1. Primary sections → boost hints (weight 2.5)
  for (const ps of (wf?.primary_sections ?? [])) {
    const node = brain.nodes_by_id.get(ps.node_id);
    if (!node || node.node_type === "orphan") continue;  // never promote orphan
    hints.push({
      node_id: ps.node_id,
      ref: ps.ref,
      title: ps.title ?? node.node_type !== "orphan" ? (node as any).title ?? null : null,
      page_start: ps.page_start ?? (node as any).page_start ?? null,
      source_pdf: ps.source_pdf ?? (node as any).source_pdf ?? null,
      hint_type: "primary_section",
      boost_weight: 2.5,
    });
  }

  // 2. Supporting tables → boost hints (weight 3.0 — tables are most precise)
  for (const st of (wf?.supporting_tables ?? [])) {
    const node = brain.nodes_by_id.get(st.node_id);
    if (!node || node.node_type === "orphan") continue;
    hints.push({
      node_id: st.node_id,
      ref: st.ref,
      title: st.title ?? (node as any).title ?? null,
      page_start: st.page_start ?? (node as any).page_start ?? null,
      source_pdf: st.source_pdf ?? (node as any).source_pdf ?? null,
      hint_type: "supporting_table",
      boost_weight: 3.0,
    });
  }

  // 3. Threshold candidates → boost hints (weight 2.0, only if confidence != low)
  for (const tc of (wf?.threshold_candidates ?? [])) {
    const node = brain.nodes_by_id.get(tc.node_id);
    if (!node || node.node_type === "orphan") continue;
    if (node.confidence === "low") continue;  // never surface low-confidence thresholds
    hints.push({
      node_id: tc.node_id,
      ref: tc.ref,
      title: tc.title ?? null,
      page_start: tc.page_start ?? (node as any).page_start ?? null,
      source_pdf: tc.source_pdf ?? (node as any).source_pdf ?? null,
      hint_type: "threshold",
      boost_weight: 2.0,
    });
  }

  // 4. Cross-references from edges (section_references_table, table_supports_section)
  const primaryNodeIds = new Set([
    ...(wf?.primary_sections ?? []).map(p => p.node_id),
    ...(wf?.supporting_tables ?? []).map(t => t.node_id),
  ]);
  for (const edge of brain.edges) {
    if (!primaryNodeIds.has(edge.from_node)) continue;
    if (edge.relation_type !== "section_references_table" &&
        edge.relation_type !== "table_supports_section") continue;
    const target = brain.nodes_by_id.get(edge.to_node);
    if (!target || target.node_type === "orphan") continue;
    if (hints.some(h => h.node_id === edge.to_node)) continue;  // already added
    hints.push({
      node_id: edge.to_node,
      ref: target.node_type !== "orphan" ? (target as any).ref : "",
      title: target.node_type !== "orphan" ? (target as any).title ?? null : null,
      page_start: target.node_type !== "orphan" ? (target as any).page_start ?? null : null,
      source_pdf: target.node_type !== "orphan" ? (target as any).source_pdf ?? null : null,
      hint_type: "xref",
      boost_weight: 1.5,
    });
  }

  // 5. Parking-lot warnings
  for (const pl of (wf?.missing_or_parking_lot_refs ?? [])) {
    parking_lot_warnings.push(pl);
  }

  // 6. Detect missing required inputs from conversation
  const missing_inputs = detectMissingInputs(
    wf?.required_inputs ?? [],
    userQuery,
    conversationContext,
  );

  const result: AugmentationResult = {
    hints,
    parking_lot_warnings,
    missing_inputs,
    safe_answer_rules: wf?.safe_answer_rules ?? [],
    must_not_claim_rules: wf?.must_not_claim_rules ?? [],
    citation_requirements: wf?.citation_requirements ?? [],
  };

  // ── R24: Occupant-load Mercantile gross/net enforcement ─────────────────────
  // Injected at code level (independent of bucket B1 package) so that the
  // correct SBC 201 Table 1004.5 Mercantile gross factors are always stated
  // first and the model never substitutes "net area" for a gross-specified row.
  if (routerResult.workflow_id === "wf_occupant_load") {
    const r24Rules = [
      "Reference: SBC 201 Table 1004.5 — cite by full name.",
      "Mercantile (Group M) ground-floor / basement sales areas: 2.8 m²/person — GROSS area.",
      "Mercantile (Group M) sales areas on other floors: 5.6 m²/person — GROSS area.",
      "Storage, stock, and shipping areas (any occupancy): 28 m²/person.",
      "NEVER say 'net area' for Mercantile — Table 1004.5 explicitly specifies gross for all Mercantile rows.",
      "State the table values first; then ask for: gross sales-area m², floor level, storage area if any.",
    ];
    result.safe_answer_rules = [...r24Rules, ...result.safe_answer_rules];
  }

  console.log(
    `[EvidenceB2] workflow=${routerResult.workflow_id} ` +
    `hints=${hints.length} parking_lot=${parking_lot_warnings.length} ` +
    `missing_inputs=${missing_inputs.length} ` +
    `safe_answer_rules=${result.safe_answer_rules.length}`
  );

  return result;
}

// ── Missing inputs detection ──────────────────────────────────────────────────

function detectMissingInputs(
  required_inputs: string[],
  query: string,
  context: string[],
): string[] {
  const allText = [query, ...context].join(" ").toLowerCase();
  const missing: string[] = [];

  for (const req of required_inputs) {
    const reqLower = req.toLowerCase();
    // Heuristic: check if the required input type is mentioned
    let mentioned = false;

    if (reqLower.includes("floor_area") || reqLower.includes("مساحة")) {
      // Area mentioned if we see numbers with m² or متر
      mentioned = /\d+\s*(m²|م²|sqm|متر|sq\.?\s*m)/i.test(allText);
    } else if (reqLower.includes("space_function") || reqLower.includes("وظيفة")) {
      // Function mentioned if we see occupancy-type words
      mentioned = /mercantile|office|residential|classroom|storage|assembly|مكتب|محل|سكني|مدرسة|تخزين/i.test(allText);
    } else if (reqLower.includes("fixed_seating")) {
      // Fixed seating mentioned if we see seating/chairs
      mentioned = /seat|chair|كرسي|مقعد|\d+\s*persons?/i.test(allText);
    } else {
      // For other inputs, assume mentioned if query is substantial
      mentioned = allText.length > 50;
    }

    if (!mentioned) missing.push(req);
  }

  return missing;
}

// ── System prompt overlay builder ─────────────────────────────────────────────
// Returns a prompt segment to inject into the Advisory system prompt.
// ONLY called when ADVISORY_BRAIN_B2_EVIDENCE_ENABLED=1.

export function buildEvidenceOverlay(
  aug: AugmentationResult,
  language: "ar" | "en",
  workflowId: string | null = null,
): string {
  const lines: string[] = [];

  // ── R26: Occupant-load mandatory protocol ─────────────────────────────────────
  // MUST be first — overrides the FINAL BINDING REMINDER ("stop if inputs missing")
  // for occupant_load only. Stating reference table values is required advisory
  // orientation, NOT a final calculation answer.
  if (workflowId === "wf_occupant_load") {
    lines.push(language === "ar"
      ? "\n\n🏗️ بروتوكول حمل الإشغال الإلزامي (يعلو على قاعدة 'أوقف واسأل'):"
      : "\n\n🏗️ OCCUPANT LOAD MANDATORY PROTOCOL (OVERRIDES 'missing inputs → stop and ask'):");
    lines.push(language === "ar"
      ? "⚠️ هذا البروتوكول يعلو على تعليمة 'المعطيات الحرجة ناقصة → أوقف واسأل' لهذا الوورك فلو فقط."
      : "⚠️ This protocol SUPERSEDES the 'critical variables missing → stop and ask' rule for this workflow only.");
    lines.push(language === "ar"
      ? "الخطوة 1 — ابدأ بـ: 'المرجع الحاكم هو SBC 201 Table 1004.5' (إلزامي في كل إجابة)"
      : "STEP 1 — Begin with: 'The governing reference is SBC 201 Table 1004.5' (mandatory in every response)");
    lines.push(language === "ar"
      ? "الخطوة 2 — اذكر القيم الثلاث فوراً (إلزامي حتى بدون مساحة):"
      : "STEP 2 — State ALL three factors immediately (mandatory even without area input):");
    lines.push(language === "ar"
      ? "  • مناطق البيع التجارية في البدروم أو الطابق الأرضي: 2.8 م²/شخص — GROSS area"
      : "  • Mercantile sales areas on ground floor or basement: 2.8 m²/person — GROSS area");
    lines.push(language === "ar"
      ? "  • مناطق البيع التجارية في الطوابق الأخرى: 5.6 م²/شخص — GROSS area"
      : "  • Mercantile sales areas on other floors: 5.6 m²/person — GROSS area");
    lines.push(language === "ar"
      ? "  • مناطق التخزين/المخزون/الشحن: 28 م²/شخص"
      : "  • Storage, stock, and shipping areas: 28 m²/person");
    lines.push(language === "ar"
      ? "الخطوة 3 — بعد ذكر القيم فقط، اطلب: مساحة البيع الإجمالية (gross m²) + الطابق + مساحة التخزين"
      : "STEP 3 — ONLY AFTER stating the above, ask for: gross sales area (m²) + floor level + storage area");
    lines.push(language === "ar"
      ? "ممنوع: البدء بالأسئلة. ممنوع: 'net area' لمناطق Mercantile. ممنوع: خلط SBC801. ممنوع: حساب نهائي بدون مساحة."
      : "FORBIDDEN: Starting with questions. FORBIDDEN: 'net area' for Mercantile. FORBIDDEN: SBC801 sources. FORBIDDEN: final calc without area.");
    lines.push(language === "ar"
      ? "ملاحظة: ذكر قيم الجدول المرجعي ليس إجابة نهائية — هو توجيه استشاري إلزامي يسبق الحساب."
      : "NOTE: Stating reference table values is NOT a final answer — it is required advisory orientation before calculation.");
  }

  // Parking-lot warnings
  if (aug.parking_lot_warnings.length > 0) {
    const header = language === "ar"
      ? "\n\n📋 تحذيرات قواعد المصدر (ملزمة — لا تتجاوز):"
      : "\n\n📋 SOURCE BOUNDS WARNINGS (binding — do not override):";
    lines.push(header);
    for (const pl of aug.parking_lot_warnings) {
      const msg = language === "ar"
        ? `- الفقرة ${pl.ref} (${pl.code}): ${pl.reason} — لا تنشر نصًا من هذا المرجع بدون استرجاع.`
        : `- Section ${pl.ref} (${pl.code}): ${pl.reason} — do not publish text from this ref without retrieval.`;
      lines.push(msg);
    }
  }

  // Missing required inputs
  if (aug.missing_inputs.length > 0) {
    const header = language === "ar"
      ? "\n\n🔒 مدخلات مطلوبة ناقصة — أوقف الحساب واطلبها من المستخدم:"
      : "\n\n🔒 REQUIRED INPUTS MISSING — stop calculation and ask the user:";
    lines.push(header);
    for (const inp of aug.missing_inputs) {
      lines.push(`  - ${inp}`);
    }
    const rule = language === "ar"
      ? "ممنوع إصدار حكم نهائي أو إجابة رقمية قبل اكتمال هذه المدخلات."
      : "Do not issue a final verdict or numeric answer until these inputs are provided.";
    lines.push(rule);
  }

  // Safe answer rules overlay
  if (aug.safe_answer_rules.length > 0) {
    const header = language === "ar"
      ? "\n\n📐 قواعد الإجابة الآمنة للوورك فلو الحالي (ملزمة):"
      : "\n\n📐 WORKFLOW SAFE-ANSWER RULES (binding):";
    lines.push(header);
    for (const rule of aug.safe_answer_rules.slice(0, 10)) {
      lines.push(`- ${rule}`);
    }
  }

  // Must-not-claim rules
  if (aug.must_not_claim_rules.length > 0) {
    const header = language === "ar"
      ? "\n\n⛔ ممنوع ادّعاء ما يلي بدون مصدر مسترجع:"
      : "\n\n⛔ MUST NOT CLAIM without retrieved source:";
    lines.push(header);
    for (const rule of aug.must_not_claim_rules.slice(0, 4)) {
      lines.push(`- ${rule}`);
    }
  }

  // Citation requirements
  if (aug.citation_requirements.length > 0) {
    const header = language === "ar"
      ? "\n\n📎 متطلبات الاستشهاد للوورك فلو الحالي:"
      : "\n\n📎 CITATION REQUIREMENTS for this workflow:";
    lines.push(header);
    for (const req of aug.citation_requirements.slice(0, 4)) {
      lines.push(`- ${req}`);
    }
  }

  // Evidence hints summary (for model orientation)
  if (aug.hints.length > 0) {
    const tables = aug.hints.filter(h => h.hint_type === "supporting_table");
    const sections = aug.hints.filter(h => h.hint_type === "primary_section");
    if (tables.length > 0 || sections.length > 0) {
      const header = language === "ar"
        ? "\n\n📚 تلميحات المصادر الداعمة (للتوجيه فقط — لا تستشهد إلا بما تم استرجاعه فعلاً):"
        : "\n\n📚 SUPPORTING SOURCE HINTS (for orientation only — cite only what was retrieved):";
      lines.push(header);
      for (const h of [...tables, ...sections].slice(0, 5)) {
        const label = language === "ar"
          ? `- ${h.hint_type === "supporting_table" ? "جدول" : "قسم"} ${h.ref}: ${h.title ?? ""} (صفحة ${h.page_start ?? "؟"})`
          : `- ${h.hint_type === "supporting_table" ? "Table" : "Section"} ${h.ref}: ${h.title ?? ""} (page ${h.page_start ?? "?"})`;
        lines.push(label);
      }
    }
  }

  return lines.join("\n");
}

// ── Cross-family check ────────────────────────────────────────────────────────
// Enforces that hints from SBC201 are not mixed with SBC801 when source family is explicit.

export function filterHintsByFamily(
  hints: EvidenceHint[],
  brain: AdvisoryBrainB1,
  explicitFamily: "SBC201" | "SBC801" | null,
): EvidenceHint[] {
  if (!explicitFamily) return hints;

  return hints.filter(h => {
    const node = brain.nodes_by_id.get(h.node_id);
    if (!node) return false;
    const code = (node as any).code ?? "";
    if (explicitFamily === "SBC201" && !code.includes("201")) return false;
    if (explicitFamily === "SBC801" && !code.includes("801")) return false;
    return true;
  });
}
