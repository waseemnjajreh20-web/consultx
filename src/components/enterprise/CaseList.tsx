import { useState } from "react";
import { Briefcase, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import CaseDetailDrawer from "@/components/enterprise/CaseDetailDrawer";
import type { useOrganization } from "@/hooks/useOrganization";

type Case = ReturnType<typeof useOrganization>["cases"][number];

interface CaseListProps {
  cases: Case[];
  loading: boolean;
  isOwnerOrAdmin: boolean;
  orgId: string;
  currentUserId?: string;
  orgRole?: string | null;
  onCreateClick: () => void;
}

const STATUS_BADGE: Record<string, { en: string; ar: string; cls: string }> = {
  draft:                    { en: "Draft",                   ar: "مسودة",                   cls: "bg-muted/40 text-muted-foreground border-border/40" },
  submitted:                { en: "Submitted",               ar: "مُقدَّمة",                  cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  assigned:                 { en: "Assigned",                ar: "موكَلة",                  cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  under_engineering_review: { en: "Under review",            ar: "قيد المراجعة",              cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  ai_review_attached:       { en: "AI attached",             ar: "مراجعة ذكية مرفقة",        cls: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  engineer_review_completed:{ en: "Eng. review done",        ar: "اكتملت المراجعة",          cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  submitted_to_head:        { en: "With head",               ar: "مع رئيس القسم",             cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  returned_for_revision:    { en: "Returned",                ar: "مُعادة للتعديل",            cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  approved_internal:        { en: "Approved",                ar: "معتمدة داخليًا",           cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  delivered_to_client:      { en: "Delivered",               ar: "مُسلَّمة",                  cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  closed:                   { en: "Closed",                  ar: "مغلقة",                   cls: "bg-muted/40 text-muted-foreground border-border/40" },
  cancelled:                { en: "Cancelled",               ar: "ملغاة",                   cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  open:                     { en: "Open",                    ar: "مفتوحة",                  cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  in_review:                { en: "In review",               ar: "قيد المراجعة",             cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  approved:                 { en: "Approved",                ar: "معتمدة",                  cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  rejected:                 { en: "Rejected",                ar: "مرفوضة",                  cls: "bg-red-500/10 text-red-400 border-red-500/20" },
};

export default function CaseList({
  cases,
  loading,
  isOwnerOrAdmin,
  orgId,
  currentUserId,
  orgRole,
  onCreateClick,
}: CaseListProps) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);

  return (
    <>
      <div className="bg-card/60 rounded-xl border border-border/40 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-sm">
            {ar ? "القضايا الهندسية" : "Engineering Cases"}
            {!loading && (
              <span className="ms-2 text-xs text-muted-foreground font-normal">({cases.length})</span>
            )}
          </h3>
          {isOwnerOrAdmin && (
            <Button variant="outline" size="sm" onClick={onCreateClick} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {ar ? "قضية جديدة" : "New Case"}
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />)}
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Briefcase className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">{ar ? "لا توجد قضايا بعد" : "No cases yet"}</p>
            {isOwnerOrAdmin && (
              <Button variant="ghost" size="sm" onClick={onCreateClick} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                {ar ? "أنشئ أولى قضاياك" : "Create your first case"}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {cases.map((c) => {
              const status = STATUS_BADGE[c.status] ?? STATUS_BADGE.draft;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCase(c)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors text-start"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Briefcase className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.case_number}{c.client_name ? ` · ${c.client_name}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${status.cls}`}>
                      {ar ? status.ar : status.en}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <CaseDetailDrawer
        open={!!selectedCase}
        onClose={() => setSelectedCase(null)}
        case_={selectedCase}
        orgId={orgId}
        currentUserId={currentUserId}
        orgRole={orgRole}
      />
    </>
  );
}
