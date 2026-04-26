import { Building2, Calendar, Hash } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { useOrganization } from "@/hooks/useOrganization";

type Org = NonNullable<ReturnType<typeof useOrganization>["org"]>;

interface OrgCardProps {
  org: Org;
  orgRole: string;
}

const ROLE_LABEL: Record<string, { en: string; ar: string }> = {
  owner:              { en: "Owner",              ar: "المالك" },
  admin:              { en: "Admin",              ar: "مدير" },
  head_of_department: { en: "Head of Department", ar: "رئيس قسم" },
  engineer:           { en: "Engineer",           ar: "مهندس" },
  finance_officer:    { en: "Finance Officer",    ar: "مسؤول مالي" },
};

const STATUS_BADGE: Record<string, { en: string; ar: string; cls: string }> = {
  active:   { en: "Active",   ar: "نشط",      cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  trial:    { en: "Trial",    ar: "تجربة",    cls: "bg-cyan-500/10  text-cyan-400  border-cyan-500/20"  },
  inactive: { en: "Inactive", ar: "غير نشط",  cls: "bg-muted/40     text-muted-foreground border-border/40" },
};

export default function OrgCard({ org, orgRole }: OrgCardProps) {
  const { language } = useLanguage();

  const status = STATUS_BADGE[org.status] ?? STATUS_BADGE.inactive;
  const role   = ROLE_LABEL[orgRole] ?? { en: orgRole, ar: orgRole };

  const trialEndLabel = org.trial_end
    ? new Date(org.trial_end).toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", {
        year: "numeric", month: "long", day: "numeric",
      })
    : null;

  return (
    <div className="bg-card/60 rounded-xl border border-border/40 p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground truncate">{org.name}</h2>
            <span className="text-xs text-muted-foreground">
              {language === "ar" ? role.ar : role.en}
            </span>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0 ${status.cls}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {language === "ar" ? status.ar : status.en}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Hash className="w-3.5 h-3.5" />
          <span className="font-mono">{org.id.slice(0, 8)}…</span>
        </div>
        {trialEndLabel && (
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>
              {language === "ar" ? `تنتهي التجربة: ${trialEndLabel}` : `Trial ends: ${trialEndLabel}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
