/**
 * CommandKPIStrip — E7.10B (Phase 1) deterministic KPI strip for the
 * AI Command Dashboard. Pure SQL/derived counters — no Gemini calls.
 *
 * Inputs are pre-computed once in AICommandDashboard so all KPIs +
 * pipeline + insight cards share the same case slice.
 */

import {
  AlertOctagon,
  Briefcase,
  CheckCircle2,
  Clock,
  FileSignature,
  Hourglass,
  PhoneOff,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

interface Props {
  ar: boolean;
  loading: boolean;
  totalCases: number;
  activeCases: number;
  pendingEngineerReview: number;
  pendingHeadApproval: number;
  returnedForRevision: number;
  deliveredLast30d: number;
  closedLifetime: number;
  stuckOver7Days: number;
  missingClientContact: number;
}

export default function CommandKPIStrip(props: Props) {
  const { ar, loading } = props;

  const items: Array<{
    key: string;
    icon: React.ReactNode;
    labelAr: string;
    labelEn: string;
    value: number;
    tone: "default" | "amber" | "red" | "green" | "blue" | "violet";
  }> = [
    { key: "total",        icon: <Briefcase className="w-3.5 h-3.5" />,    labelAr: "إجمالي المعاملات", labelEn: "Total cases",         value: props.totalCases,           tone: "default" },
    { key: "active",       icon: <Sparkles className="w-3.5 h-3.5" />,     labelAr: "نشطة",             labelEn: "Active",              value: props.activeCases,          tone: "blue"    },
    { key: "engReview",    icon: <Hourglass className="w-3.5 h-3.5" />,    labelAr: "بانتظار المراجعة الهندسية", labelEn: "Pending engineer review", value: props.pendingEngineerReview, tone: "amber" },
    { key: "headApproval", icon: <ShieldAlert className="w-3.5 h-3.5" />,  labelAr: "بانتظار رئيس القسم", labelEn: "Pending head approval", value: props.pendingHeadApproval, tone: "amber"   },
    { key: "returned",     icon: <RefreshCcw className="w-3.5 h-3.5" />,   labelAr: "معادة للتعديل",   labelEn: "Returned for revision", value: props.returnedForRevision, tone: "red"    },
    { key: "delivered30d", icon: <FileSignature className="w-3.5 h-3.5" />,labelAr: "مُسلَّمة (30 يوم)", labelEn: "Delivered (30d)",       value: props.deliveredLast30d,    tone: "green"  },
    { key: "closed",       icon: <CheckCircle2 className="w-3.5 h-3.5" />, labelAr: "مغلقة كلياً",     labelEn: "Closed (lifetime)",     value: props.closedLifetime,      tone: "default"},
    { key: "stuck",        icon: <Clock className="w-3.5 h-3.5" />,        labelAr: "متوقفة > 7 أيام", labelEn: "Stuck > 7 days",        value: props.stuckOver7Days,      tone: "red"    },
    { key: "missingClient",icon: <PhoneOff className="w-3.5 h-3.5" />,     labelAr: "بدون جهة اتصال عميل", labelEn: "Missing client contact", value: props.missingClientContact, tone: "violet" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {items.map((it) => (
        <KpiTile key={it.key} icon={it.icon} label={ar ? it.labelAr : it.labelEn} value={it.value} loading={loading} tone={it.tone} />
      ))}
    </div>
  );
}

function KpiTile({
  icon, label, value, loading, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
  tone: "default" | "amber" | "red" | "green" | "blue" | "violet";
}) {
  const toneClasses: Record<string, string> = {
    default: "border-border/40 bg-card/50",
    amber:   value > 0 ? "border-amber-500/30 bg-amber-500/5"   : "border-border/40 bg-card/50",
    red:     value > 0 ? "border-red-500/30 bg-red-500/5"       : "border-border/40 bg-card/50",
    green:   value > 0 ? "border-green-500/30 bg-green-500/5"   : "border-border/40 bg-card/50",
    blue:    value > 0 ? "border-blue-500/30 bg-blue-500/5"     : "border-border/40 bg-card/50",
    violet:  value > 0 ? "border-violet-500/30 bg-violet-500/5" : "border-border/40 bg-card/50",
  };

  const toneIcon: Record<string, string> = {
    default: "text-muted-foreground",
    amber:   value > 0 ? "text-amber-300"  : "text-muted-foreground",
    red:     value > 0 ? "text-red-300"    : "text-muted-foreground",
    green:   value > 0 ? "text-green-300"  : "text-muted-foreground",
    blue:    value > 0 ? "text-blue-300"   : "text-muted-foreground",
    violet:  value > 0 ? "text-violet-300" : "text-muted-foreground",
  };

  const fallbackIcon = value === 0 && tone !== "default" && !loading
    ? <AlertOctagon className="w-3.5 h-3.5 text-muted-foreground/40" />
    : null;

  return (
    <div className={`rounded-xl border p-3 ${toneClasses[tone]}`}>
      <div className={`flex items-center gap-1.5 text-[11px] mb-1.5 ${toneIcon[tone]}`}>
        {icon}
        <span className="truncate text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xl font-semibold tabular-nums">
          {loading ? <span className="inline-block w-6 h-5 bg-muted/40 rounded animate-pulse" /> : value}
        </p>
        {fallbackIcon}
      </div>
    </div>
  );
}
