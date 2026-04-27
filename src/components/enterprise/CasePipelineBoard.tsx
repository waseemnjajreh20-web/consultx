/**
 * CasePipelineBoard — E7.10B (Phase 1) kanban-style pipeline board.
 *
 * No drag-and-drop in v1: clicking a case card opens the existing
 * CaseDetailDrawer via the parent-supplied callback. Status changes
 * still go through transition_case_status RPC inside the drawer.
 *
 * Columns mirror the canonical lifecycle from
 * supabase/migrations/20260426000002_enterprise_case_document_core_schema.sql
 * Side rails render `returned_for_revision` and `cancelled` separately.
 */

import { useMemo } from "react";
import { Briefcase, ChevronRight } from "lucide-react";
import CaseResponsibilityBadge from "@/components/enterprise/CaseResponsibilityBadge";
import type { useOrganization } from "@/hooks/useOrganization";

type Case = ReturnType<typeof useOrganization>["cases"][number];

interface Props {
  cases: Case[];
  loading: boolean;
  ar: boolean;
  isOwnerOrAdmin: boolean;
  onOpenCase: (caseRow: Case) => void;
}

const PIPELINE_COLUMNS: Array<{ status: string; ar: string; en: string; tone: string }> = [
  { status: "draft",                     ar: "مسودة",                en: "Draft",                tone: "border-border/40 bg-muted/10" },
  { status: "submitted",                 ar: "مُقدَّمة",              en: "Submitted",            tone: "border-blue-500/25 bg-blue-500/5" },
  { status: "assigned",                  ar: "موكَلة",               en: "Assigned",             tone: "border-cyan-500/25 bg-cyan-500/5" },
  { status: "under_engineering_review",  ar: "مراجعة هندسية",        en: "Under eng. review",    tone: "border-amber-500/25 bg-amber-500/5" },
  { status: "ai_review_attached",        ar: "مراجعة ذكية",          en: "AI attached",          tone: "border-violet-500/25 bg-violet-500/5" },
  { status: "engineer_review_completed", ar: "اكتملت المراجعة",      en: "Eng. review done",     tone: "border-cyan-500/25 bg-cyan-500/5" },
  { status: "submitted_to_head",         ar: "مع رئيس القسم",         en: "With head",            tone: "border-amber-500/25 bg-amber-500/5" },
  { status: "approved_internal",         ar: "اعتماد داخلي",          en: "Approved",             tone: "border-green-500/25 bg-green-500/5" },
  { status: "delivered_to_client",       ar: "مُسلَّمة",               en: "Delivered",            tone: "border-green-500/25 bg-green-500/5" },
  { status: "closed",                    ar: "مغلقة",                en: "Closed",               tone: "border-border/40 bg-muted/10" },
];

const SIDE_RAILS: Array<{ status: string; ar: string; en: string; tone: string }> = [
  { status: "returned_for_revision", ar: "مُعادة للتعديل", en: "Returned for revision", tone: "border-red-500/30 bg-red-500/5" },
  { status: "cancelled",             ar: "ملغاة",         en: "Cancelled",             tone: "border-red-500/20 bg-muted/10" },
];

export default function CasePipelineBoard({ cases, loading, ar, isOwnerOrAdmin, onOpenCase }: Props) {
  const grouped = useMemo(() => {
    const acc: Record<string, Case[]> = {};
    for (const c of cases) {
      (acc[c.status] ??= []).push(c);
    }
    return acc;
  }, [cases]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-40 bg-muted/20 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main pipeline */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="grid grid-flow-col auto-cols-[minmax(220px,1fr)] gap-2 min-w-max">
          {PIPELINE_COLUMNS.map((col) => (
            <PipelineColumn
              key={col.status}
              ar={ar}
              isOwnerOrAdmin={isOwnerOrAdmin}
              labelAr={col.ar}
              labelEn={col.en}
              tone={col.tone}
              cases={grouped[col.status] ?? []}
              onOpenCase={onOpenCase}
            />
          ))}
        </div>
      </div>

      {/* Side rails */}
      {SIDE_RAILS.some((r) => (grouped[r.status]?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {SIDE_RAILS.map((rail) => {
            const items = grouped[rail.status] ?? [];
            if (items.length === 0) return null;
            return (
              <PipelineColumn
                key={rail.status}
                ar={ar}
                isOwnerOrAdmin={isOwnerOrAdmin}
                labelAr={rail.ar}
                labelEn={rail.en}
                tone={rail.tone}
                cases={items}
                onOpenCase={onOpenCase}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function PipelineColumn({
  ar, isOwnerOrAdmin, labelAr, labelEn, tone, cases, onOpenCase,
}: {
  ar: boolean;
  isOwnerOrAdmin: boolean;
  labelAr: string;
  labelEn: string;
  tone: string;
  cases: ReturnType<typeof useOrganization>["cases"];
  onOpenCase: (caseRow: ReturnType<typeof useOrganization>["cases"][number]) => void;
}) {
  return (
    <div className={`rounded-xl border p-2 space-y-1.5 ${tone}`}>
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] font-semibold truncate">{ar ? labelAr : labelEn}</p>
        <span className="text-[10px] tabular-nums text-muted-foreground bg-background/40 border border-border/40 rounded-full px-1.5 py-0.5 shrink-0">
          {cases.length}
        </span>
      </div>

      {cases.length === 0 ? (
        <div className="text-[10px] text-muted-foreground/60 text-center py-3">
          {ar ? "—" : "—"}
        </div>
      ) : (
        <div className="space-y-1.5">
          {cases.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpenCase(c)}
              className="w-full text-start rounded-lg border border-border/40 bg-background/40 hover:bg-background/60 transition-colors p-2 space-y-1"
            >
              <div className="flex items-start gap-1.5">
                <Briefcase className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate leading-tight">{c.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {c.case_number}
                    {c.client_name ? ` · ${c.client_name}` : ""}
                  </p>
                </div>
                <ChevronRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
              </div>
              <CaseResponsibilityBadge
                assignedEngineerId={c.assigned_engineer_id ?? null}
                headReviewerId={c.head_reviewer_id ?? null}
                ar={ar}
                showHints={isOwnerOrAdmin}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
