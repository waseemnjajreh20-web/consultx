/**
 * brain_b1_types.ts
 *
 * TypeScript types for the Advisory Brain B1 runtime package.
 * Used by the loader, router, evidence augmenter, and constraint overlay.
 *
 * ALL B2 code is gated behind ADVISORY_BRAIN_B2_ENABLED=1.
 * These types are never instantiated when the flag is off.
 */

// ── Node types ────────────────────────────────────────────────────────────────

export type NodeType = "section" | "subsection" | "table" | "orphan" | "threshold";
export type Confidence = "high" | "medium" | "low";
export type CanonicalStatus = "extracted_v4" | "parking_lot" | "not_indexed";

export interface BrainSectionNode {
  node_id: string;
  code: string;          // "SBC 201" | "SBC 801"
  ref: string;           // "1004.5", "309", etc.
  node_type: "section" | "subsection";
  title: string | null;
  page_start: number | null;
  page_end: number | null;
  source_pdf: string | null;
  confidence: Confidence;
  tags: string[];
  canonical_status: CanonicalStatus;
}

export interface BrainTableNode {
  node_id: string;
  code: string;
  ref: string;
  node_type: "table";
  title: string | null;
  page_start: number | null;
  page_end: number | null;
  source_pdf: string | null;
  confidence: Confidence;
  tags: string[];
  row_count: number | null;
  column_headers: string[] | null;
  canonical_status: CanonicalStatus;
}

export interface BrainOrphanNode {
  node_id: string;
  code: string;
  ref: string;
  node_type: "orphan";
  title: string | null;
  page_start: number | null;
  source_pdf: string | null;
  confidence: "low";
  orphan_reason: string;
  tags: string[];
  do_not_promote: true;  // invariant: always true
}

export interface BrainThresholdNode {
  node_id: string;
  code: string;
  ref: string;
  node_type: "threshold";
  value: number | string | null;
  unit: string | null;
  condition: string | null;
  section_ref: string;
  source_pdf: string | null;
  confidence: Confidence;
  tags: string[];
}

export type BrainNode = BrainSectionNode | BrainTableNode | BrainOrphanNode | BrainThresholdNode;

// ── Edge types ────────────────────────────────────────────────────────────────

export type RelationType =
  | "parent_child"
  | "section_references_section"
  | "section_references_table"
  | "table_supports_section"
  | "definition_supports_section"
  | "threshold_in_section"
  | "orphan_referenced_by_parent"
  | "same_chapter"
  | "same_system_family";

export interface BrainEdge {
  edge_id: string;
  from_node: string;
  to_node: string;
  relation_type: RelationType;
  confidence: Confidence;
  evidence_method: string | null;
}

export interface ExternalXref {
  from_node: string;
  target_kind: string;
  target_ref: string;
  target_code: string;
  evidence_text: string;
  evidence_method: string;
  reason: string;
}

// ── Workflow types ────────────────────────────────────────────────────────────

export type WorkflowDomain =
  | "occupancy_classification"
  | "occupant_load"
  | "egress"
  | "sprinkler"
  | "fire_alarm"
  | "fire_pump"
  | "standpipe"
  | "smoke_control"
  | "general_code_lookup"
  | "non_code";

export type WorkflowId =
  | "wf_occupancy_classification"
  | "wf_occupant_load"
  | "wf_egress"
  | "wf_sprinkler"
  | "wf_fire_alarm"
  | "wf_fire_pump"
  | "wf_standpipe"
  | "wf_smoke_control";

export interface WorkflowNodeRef {
  node_id: string;
  ref: string;
  title: string | null;
  page_start: number | null;
  source_pdf: string | null;
}

export interface ParkingLotRef {
  ref: string;
  code: string;
  reason: string;
  node_id?: string;
}

export interface AdvisoryWorkflow {
  schema_version: string;
  workflow_id: WorkflowId;
  domain: WorkflowDomain;
  description: string | null;
  required_inputs: string[];
  primary_sections: WorkflowNodeRef[];
  supporting_tables: WorkflowNodeRef[];
  threshold_candidates: WorkflowNodeRef[];
  missing_or_parking_lot_refs: ParkingLotRef[];
  safe_answer_rules: string[];
  must_not_claim_rules: string[];
  citation_requirements: string[];
  definitions_needed: Array<{ term: string; parking_lot_reason?: string }>;
}

// ── Router result ─────────────────────────────────────────────────────────────

export interface RouterResult {
  workflow_id: WorkflowId | "wf_general_code_lookup" | "wf_non_code";
  domain: WorkflowDomain;
  confidence: Confidence;
  matched_by: string[];     // e.g. ["keyword:رشاشات", "explicit_ref:903.2.7"]
  parking_lot_pre_check: ParkingLotRef[];
  required_inputs: string[];
  workflow: AdvisoryWorkflow | null;
}

// ── Evidence augmentation result ──────────────────────────────────────────────

export interface EvidenceHint {
  node_id: string;
  ref: string;
  title: string | null;
  page_start: number | null;
  source_pdf: string | null;
  hint_type: "primary_section" | "supporting_table" | "threshold" | "xref";
  boost_weight: number;       // 1.0–3.0 for retrieval scoring
}

export interface AugmentationResult {
  hints: EvidenceHint[];
  parking_lot_warnings: ParkingLotRef[];
  missing_inputs: string[];        // required_inputs not yet provided
  safe_answer_rules: string[];
  must_not_claim_rules: string[];
  citation_requirements: string[];
}

// ── Full brain object (loaded in memory) ─────────────────────────────────────

export interface AdvisoryBrainB1 {
  manifest: {
    schema_version: string;
    generated_at: string;
    brain_version: string;
    v4_corpus_chunks_total: number;
    node_counts: Record<string, number>;
    edge_counts: Record<string, number>;
    workflow_count: number;
    validation_case_count: number;
    invariants: Record<string, unknown>;
  };
  sections: BrainSectionNode[];
  tables: BrainTableNode[];
  orphans: BrainOrphanNode[];
  thresholds: BrainThresholdNode[];
  edges: BrainEdge[];
  external_xrefs: ExternalXref[];
  workflows: AdvisoryWorkflow[];
  // Fast lookup
  nodes_by_id: Map<string, BrainNode>;
  workflows_by_id: Map<string, AdvisoryWorkflow>;
}
