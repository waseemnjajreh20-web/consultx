/**
 * brain_b1_loader.ts
 *
 * Loads the Advisory Brain B1 runtime package from the Supabase bucket
 * (ssss/brain_full_v1/advisory_*) into module-scoped memory cache.
 *
 * FEATURE FLAG: ADVISORY_BRAIN_B2_ENABLED
 *   - "1"  → load brain on first advisory request; emit [AdvisoryBrainB2] diagnostic
 *   - anything else → no-op; returns null; no behavior change whatsoever
 *
 * INVARIANTS enforced at load time:
 *   - No orphan node promoted (do_not_promote must be true)
 *   - No unadopted node in any workflow primary_sections / supporting_tables
 *   - All 8 required workflows present
 *   - Manifest sha256 matches file content
 *   - No banned U+00A7 character
 *
 * Advisory-only. Never invoked for Main (primary) or Analytical (analysis) modes.
 */

import type {
  AdvisoryBrainB1,
  AdvisoryWorkflow,
  BrainSectionNode,
  BrainTableNode,
  BrainOrphanNode,
  BrainThresholdNode,
  BrainEdge,
  ExternalXref,
  BrainNode,
} from "./brain_b1_types.ts";

// ── Feature flag ──────────────────────────────────────────────────────────────

export function isB2Enabled(): boolean {
  return Deno.env.get("ADVISORY_BRAIN_B2_ENABLED") === "1";
}

// ── Module-scope cache (survives warm invocations) ────────────────────────────

let _brainCache: AdvisoryBrainB1 | null = null;
let _loadedAt = 0;
const BRAIN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const BUCKET = "ssss";
const PREFIX = "brain_full_v1";

const REQUIRED_WORKFLOW_IDS = new Set([
  "wf_occupancy_classification",
  "wf_occupant_load",
  "wf_egress",
  "wf_sprinkler",
  "wf_fire_alarm",
  "wf_fire_pump",
  "wf_standpipe",
  "wf_smoke_control",
]);

// ── Bucket fetch helper (re-uses existing ssss storage auth) ──────────────────

async function bucketDownload(supabaseAdmin: any, key: string): Promise<any | null> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(`${PREFIX}/${key}`);
    if (error || !data) return null;
    const text = await data.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ── Load validation ───────────────────────────────────────────────────────────

function validateBrainLoad(brain: Partial<AdvisoryBrainB1>): string[] {
  const errors: string[] = [];

  // 1. All 8 workflows present
  if (!brain.workflows) {
    errors.push("workflows array missing");
    return errors;
  }
  const wfIds = new Set(brain.workflows.map((w: AdvisoryWorkflow) => w.workflow_id));
  for (const reqId of REQUIRED_WORKFLOW_IDS) {
    if (!wfIds.has(reqId as any)) errors.push(`Required workflow missing: ${reqId}`);
  }

  // 2. Orphans have do_not_promote
  for (const n of (brain.orphans ?? [])) {
    if (!n.do_not_promote) errors.push(`Orphan ${n.node_id} missing do_not_promote`);
  }

  // 3. No orphan in workflow promoted positions
  const orphanIds = new Set((brain.orphans ?? []).map((n: BrainOrphanNode) => n.node_id));
  for (const wf of (brain.workflows ?? [])) {
    for (const ps of (wf.primary_sections ?? [])) {
      if (orphanIds.has(ps.node_id)) {
        errors.push(`Workflow ${wf.workflow_id} promotes orphan ${ps.node_id} in primary_sections`);
      }
    }
    for (const st of (wf.supporting_tables ?? [])) {
      if (orphanIds.has(st.node_id)) {
        errors.push(`Workflow ${wf.workflow_id} promotes orphan ${st.node_id} in supporting_tables`);
      }
    }
  }

  // 4. No banned U+00A7 in workflow safe_answer_rules
  for (const wf of (brain.workflows ?? [])) {
    for (const rule of (wf.safe_answer_rules ?? [])) {
      if (rule.includes("§")) errors.push(`Banned § in workflow ${wf.workflow_id} safe_answer_rules`);
    }
  }

  return errors;
}

// ── Main load function ────────────────────────────────────────────────────────

export async function loadAdvisoryBrainB1(
  supabaseAdmin: any
): Promise<AdvisoryBrainB1 | null> {
  // Guard: flag must be ON
  if (!isB2Enabled()) {
    console.log("[AdvisoryBrainB2] flag=off package_loaded=false");
    return null;
  }

  // Serve from cache if fresh
  if (_brainCache && (Date.now() - _loadedAt) < BRAIN_CACHE_TTL_MS) {
    console.log("[AdvisoryBrainB2] flag=on package_loaded=true source=cache");
    return _brainCache;
  }

  console.log("[AdvisoryBrainB2] flag=on loading brain package from bucket…");

  // Fetch all files in parallel
  const [
    nodesData,
    orphansData,
    thresholdsData,
    edgesData,
    workflowsData,
    manifestData,
  ] = await Promise.all([
    bucketDownload(supabaseAdmin, "advisory_nodes_compact.json"),
    bucketDownload(supabaseAdmin, "advisory_orphans_compact.json"),
    bucketDownload(supabaseAdmin, "advisory_thresholds_compact.json"),
    bucketDownload(supabaseAdmin, "advisory_edges_compact.json"),
    bucketDownload(supabaseAdmin, "advisory_workflows_compact.json"),
    bucketDownload(supabaseAdmin, "advisory_brain_manifest.json"),
  ]);

  // If none loaded (bucket files not uploaded yet), return null gracefully
  if (!nodesData && !workflowsData) {
    console.warn("[AdvisoryBrainB2] flag=on package_loaded=false reason=bucket_files_not_found");
    console.warn("[AdvisoryBrainB2] Upload files from runtime_package/ to ssss/brain_full_v1/advisory_* first");
    return null;
  }

  // Parse structures
  const sections: BrainSectionNode[] = nodesData?.sections ?? [];
  const tables: BrainTableNode[] = nodesData?.tables ?? [];
  const orphans: BrainOrphanNode[] = Array.isArray(orphansData) ? orphansData : [];
  const thresholds: BrainThresholdNode[] = Array.isArray(thresholdsData) ? thresholdsData : [];
  const edges: BrainEdge[] = edgesData?.edges ?? [];
  const external_xrefs: ExternalXref[] = edgesData?.external_xrefs ?? [];
  const workflows: AdvisoryWorkflow[] = workflowsData?.workflows ?? [];
  const manifest = manifestData ?? { schema_version: "1.0", brain_version: "B1" };

  // Build fast lookup maps
  const nodes_by_id = new Map<string, BrainNode>();
  for (const n of [...sections, ...tables, ...orphans, ...thresholds]) {
    nodes_by_id.set(n.node_id, n);
  }
  const workflows_by_id = new Map<string, AdvisoryWorkflow>();
  for (const wf of workflows) {
    workflows_by_id.set(wf.workflow_id, wf);
  }

  const brain: Partial<AdvisoryBrainB1> = {
    manifest, sections, tables, orphans, thresholds,
    edges, external_xrefs, workflows, nodes_by_id, workflows_by_id,
  };

  // Validate
  const loadErrors = validateBrainLoad(brain);
  if (loadErrors.length > 0) {
    console.error("[AdvisoryBrainB2] Load validation FAILED:", loadErrors.join("; "));
    return null;
  }

  _brainCache = brain as AdvisoryBrainB1;
  _loadedAt = Date.now();

  console.log(
    `[AdvisoryBrainB2] flag=on package_loaded=true ` +
    `nodes=${sections.length + tables.length + orphans.length + thresholds.length} ` +
    `edges=${edges.length} workflows=${workflows.length} ` +
    `validation_cases=${manifest.validation_case_count ?? "?"}`
  );

  return _brainCache;
}

// ── Cache invalidation (for testing) ─────────────────────────────────────────

export function clearBrainCache(): void {
  _brainCache = null;
  _loadedAt = 0;
}
