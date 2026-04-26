import { useState } from "react";
import { Briefcase, Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useLanguage } from "@/hooks/useLanguage";
import type { useOrganization } from "@/hooks/useOrganization";

type Case = ReturnType<typeof useOrganization>["cases"][number];

interface CaseListProps {
  cases: Case[];
  loading: boolean;
  isOwnerOrAdmin: boolean;
  onCreateClick: () => void;
}

const STATUS_BADGE: Record<string, { en: string; ar: string; cls: string }> = {
  open:        { en: "Open",        ar: "مفتوحة",     cls: "bg-blue-500/10  text-blue-400  border-blue-500/20"  },
  in_review:   { en: "In Review",   ar: "قيد المراجعة",cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  approved:    { en: "Approved",    ar: "معتمدة",     cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  rejected:    { en: "Rejected",    ar: "مرفوضة",     cls: "bg-red-500/10   text-red-400   border-red-500/20"   },
  closed:      { en: "Closed",      ar: "مغلقة",      cls: "bg-muted/40     text-muted-foreground border-border/40" },
};

function CaseDetail({ c, onClose }: { c: Case; onClose: () => void }) {
  const { language } = useLanguage();
  const status = STATUS_BADGE[c.status] ?? STATUS_BADGE.open;

  const rows: { labelEn: string; labelAr: string; value: string | null }[] = [
    { labelEn: "Case #",        labelAr: "رقم القضية",    value: c.case_number },
    { labelEn: "Client",        labelAr: "العميل",        value: c.client_name },
    { labelEn: "Reference",     labelAr: "المرجع",        value: c.client_ref },
  ];

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${status.cls}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {language === "ar" ? status.ar : status.en}
        </span>
      </div>

      <div className="space-y-3 text-sm">
        {rows.map((r) => r.value && (
          <div key={r.labelEn}>
            <p className="text-xs text-muted-foreground mb-0.5">
              {language === "ar" ? r.labelAr : r.labelEn}
            </p>
            <p className="font-medium">{r.value}</p>
          </div>
        ))}
        {c.description && (
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">
              {language === "ar" ? "الوصف" : "Description"}
            </p>
            <p className="text-muted-foreground leading-relaxed">{c.description}</p>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground border-t border-border/30 pt-3">
        {language === "ar" ? "تاريخ الإنشاء:" : "Created:"}{" "}
        {new Date(c.created_at).toLocaleDateString(language === "ar" ? "ar-SA" : "en-US")}
      </p>
    </div>
  );
}

export default function CaseList({ cases, loading, isOwnerOrAdmin, onCreateClick }: CaseListProps) {
  const { language } = useLanguage();
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);

  return (
    <>
      <div className="bg-card/60 rounded-xl border border-border/40 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-sm">
            {language === "ar" ? "القضايا الهندسية" : "Engineering Cases"}
            {!loading && (
              <span className="ms-2 text-xs text-muted-foreground font-normal">
                ({cases.length})
              </span>
            )}
          </h3>
          {isOwnerOrAdmin && (
            <Button variant="outline" size="sm" onClick={onCreateClick} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {language === "ar" ? "قضية جديدة" : "New Case"}
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Briefcase className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              {language === "ar" ? "لا توجد قضايا بعد" : "No cases yet"}
            </p>
            {isOwnerOrAdmin && (
              <Button variant="ghost" size="sm" onClick={onCreateClick} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                {language === "ar" ? "أنشئ أولى قضاياك" : "Create your first case"}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {cases.map((c) => {
              const status = STATUS_BADGE[c.status] ?? STATUS_BADGE.open;
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
                      {language === "ar" ? status.ar : status.en}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={!!selectedCase} onOpenChange={(open) => { if (!open) setSelectedCase(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-start truncate">
              {selectedCase?.title ?? ""}
            </SheetTitle>
          </SheetHeader>
          {selectedCase && (
            <CaseDetail c={selectedCase} onClose={() => setSelectedCase(null)} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
