/**
 * CommandInsightCards — E7.10B (Phase 1) deterministic insight cards.
 *
 * Each card is a focused gap/risk derived from existing case data plus
 * one ancillary query (case_documents counts and case_client_contacts
 * coverage). No Gemini calls — Phase 3 (E7.10D) adds AI-drafted cards.
 *
 * Cards:
 *  1. Stuck > 7 days at current status (proxy: updated_at).
 *  2. Returned for revision — grouped by assigned engineer.
 *  3. Cases without a client contact row.
 *  4. Cases at ai_review_attached without an accepted AI report.
 *  5. Cases with no documents in {drawings, specs} categories.
 */

import { useMemo } from "react";
import {
  BookOpen,
  Brain,
  Clock,
  PhoneOff,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import type { useOrganization } from "@/hooks/useOrganization";

type Case = ReturnType<typeof useOrganization>["cases"][number];

interface Props {
  ar: boolean;
  cases: Case[];
  caseIdsWithoutContact: Set<string>;
  caseIdsWithoutAcceptedAi: Set<string>;
  caseIdsMissingRequiredDocs: Set<string>;
  resolveEngineerName: (userId: string | null | undefined) => string;
  onOpenCase: (caseRow: Case) => void;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const STUCK_TRACKED_STATUSES = new Set([
  "submitted",
  "assigned",
  "under_engineering_review",
  "ai_review_attached",
  "engineer_review_completed",
  "submitted_to_head",
  "returned_for_revision",
]);

export default function CommandInsightCards({
  ar,
  cases,
  caseIdsWithoutContact,
  caseIdsWithoutAcceptedAi,
  caseIdsMissingRequiredDocs,
  resolveEngineerName,
  onOpenCase,
}: Props) {
  // 1. Stuck > 7 days at current status.
  const stuckCases = useMemo(() => {
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    return cases
      .filter((c) => STUCK_TRACKED_STATUSES.has(c.status))
      .filter((c) => new Date(c.updated_at).getTime() < cutoff)
      .slice(0, 6);
  }, [cases]);

  // 2. Returned for revision — grouped by engineer.
  const returnedByEngineer = useMemo(() => {
    const groups: Record<string, Case[]> = {};
    for (const c of cases) {
      if (c.status !== "returned_for_revision") continue;
      const key = c.assigned_engineer_id ?? "__unassigned__";
      (groups[key] ??= []).push(c);
    }
    return Object.entries(groups);
  }, [cases]);

  // 3. Without a client contact.
  const missingContactCases = useMemo(
    () => cases.filter((c) => caseIdsWithoutContact.has(c.id)).slice(0, 6),
    [cases, caseIdsWithoutContact],
  );

  // 4. ai_review_attached without accepted AI report.
  const blockedAiCases = useMemo(
    () =>
      cases
        .filter((c) => c.status === "ai_review_attached")
        .filter((c) => caseIdsWithoutAcceptedAi.has(c.id))
        .slice(0, 6),
    [cases, caseIdsWithoutAcceptedAi],
  );

  // 5. Missing required documents.
  const missingDocsCases = useMemo(
    () =>
      cases
        .filter((c) => caseIdsMissingRequiredDocs.has(c.id))
        .slice(0, 6),
    [cases, caseIdsMissingRequiredDocs],
  );

  // Render
  const cardCount =
    (stuckCases.length > 0 ? 1 : 0) +
    (returnedByEngineer.length > 0 ? 1 : 0) +
    (missingContactCases.length > 0 ? 1 : 0) +
    (blockedAiCases.length > 0 ? 1 : 0) +
    (missingDocsCases.length > 0 ? 1 : 0);

  if (cardCount === 0) {
    return (
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-5 text-center space-y-1.5">
        <Sparkles className="w-5 h-5 text-green-300 mx-auto" />
        <p className="text-sm font-semibold text-green-200">
          {ar ? "لا توجد إشارات مقلقة" : "No actionable insights"}
        </p>
        <p className="text-[11px] text-green-200/70">
          {ar
            ? "جميع المعاملات تتقدم ضمن الحدود الطبيعية."
            : "All cases are progressing within healthy bounds."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Stuck > 7d */}
      {stuckCases.length > 0 && (
        <InsightCard
          ar={ar}
          icon={<Clock className="w-4 h-4" />}
          tone="red"
          titleAr="معاملات متوقفة منذ أكثر من 7 أيام"
          titleEn="Stuck more than 7 days"
          subtitleAr="آخر تحديث على الحالة الحالية تجاوز أسبوعاً."
          subtitleEn="Last update at current status exceeded one week."
        >
          {stuckCases.map((c) => (
            <CaseRow key={c.id} ar={ar} c={c} onOpen={onOpenCase}
              extra={ar ? `منذ ${daysAgo(c.updated_at)} يوم` : `${daysAgo(c.updated_at)}d ago`} />
          ))}
        </InsightCard>
      )}

      {/* Returned for revision by engineer */}
      {returnedByEngineer.length > 0 && (
        <InsightCard
          ar={ar}
          icon={<RefreshCcw className="w-4 h-4" />}
          tone="amber"
          titleAr="معاملات معادة للتعديل"
          titleEn="Returned for revision"
          subtitleAr="بحاجة إلى استئناف العمل من قبل المهندس المسؤول."
          subtitleEn="Needs the assigned engineer to resume."
        >
          {returnedByEngineer.map(([engineerId, list]) => (
            <div key={engineerId} className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                {engineerId === "__unassigned__"
                  ? (ar ? "بدون مهندس" : "Unassigned")
                  : resolveEngineerName(engineerId)}
                <span className="ms-1 text-muted-foreground/60 font-normal">({list.length})</span>
              </p>
              {list.slice(0, 4).map((c) => (
                <CaseRow key={c.id} ar={ar} c={c} onOpen={onOpenCase} />
              ))}
            </div>
          ))}
        </InsightCard>
      )}

      {/* Missing client contact */}
      {missingContactCases.length > 0 && (
        <InsightCard
          ar={ar}
          icon={<PhoneOff className="w-4 h-4" />}
          tone="violet"
          titleAr="معاملات بدون جهة اتصال للعميل"
          titleEn="Cases without a client contact"
          subtitleAr="لن يتلقى العميل أي إشعار حتى تُضاف بياناته."
          subtitleEn="The client will receive no notifications until contact info is added."
        >
          {missingContactCases.map((c) => (
            <CaseRow key={c.id} ar={ar} c={c} onOpen={onOpenCase} />
          ))}
        </InsightCard>
      )}

      {/* AI evidence missing */}
      {blockedAiCases.length > 0 && (
        <InsightCard
          ar={ar}
          icon={<Brain className="w-4 h-4" />}
          tone="blue"
          titleAr="بحاجة إلى تأكيد الدليل الذكي"
          titleEn="Awaiting accepted AI evidence"
          subtitleAr="لا يمكن إكمال المراجعة الهندسية بدون قبول تقرير ذكي واحد على الأقل."
          subtitleEn="Engineer review cannot complete without at least one accepted AI report."
        >
          {blockedAiCases.map((c) => (
            <CaseRow key={c.id} ar={ar} c={c} onOpen={onOpenCase} />
          ))}
        </InsightCard>
      )}

      {/* Missing required documents */}
      {missingDocsCases.length > 0 && (
        <InsightCard
          ar={ar}
          icon={<BookOpen className="w-4 h-4" />}
          tone="amber"
          titleAr="ينقصها مستندات أساسية"
          titleEn="Missing required documents"
          subtitleAr="لم يتم رفع أي مستند ضمن فئة الرسومات أو المواصفات."
          subtitleEn="No document uploaded under the drawings or specs categories."
        >
          {missingDocsCases.map((c) => (
            <CaseRow key={c.id} ar={ar} c={c} onOpen={onOpenCase} />
          ))}
        </InsightCard>
      )}
    </div>
  );
}

function daysAgo(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)));
}

function InsightCard({
  ar,
  icon,
  tone,
  titleAr,
  titleEn,
  subtitleAr,
  subtitleEn,
  children,
}: {
  ar: boolean;
  icon: React.ReactNode;
  tone: "red" | "amber" | "blue" | "violet";
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  children: React.ReactNode;
}) {
  const tones: Record<typeof tone, { border: string; bg: string; iconCls: string; titleCls: string }> = {
    red:    { border: "border-red-500/30",    bg: "bg-red-500/5",    iconCls: "text-red-300",    titleCls: "text-red-200" },
    amber:  { border: "border-amber-500/30",  bg: "bg-amber-500/5",  iconCls: "text-amber-300",  titleCls: "text-amber-200" },
    blue:   { border: "border-blue-500/30",   bg: "bg-blue-500/5",   iconCls: "text-blue-300",   titleCls: "text-blue-200" },
    violet: { border: "border-violet-500/30", bg: "bg-violet-500/5", iconCls: "text-violet-300", titleCls: "text-violet-200" },
  };
  const t = tones[tone];

  return (
    <div className={`rounded-xl border ${t.border} ${t.bg} p-4 space-y-2`}>
      <div className="space-y-0.5">
        <p className={`text-sm font-semibold flex items-center gap-2 ${t.titleCls}`}>
          <span className={t.iconCls}>{icon}</span>
          {ar ? titleAr : titleEn}
        </p>
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
          {ar ? subtitleAr : subtitleEn}
        </p>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function CaseRow({
  ar, c, onOpen, extra,
}: {
  ar: boolean;
  c: ReturnType<typeof useOrganization>["cases"][number];
  onOpen: (caseRow: ReturnType<typeof useOrganization>["cases"][number]) => void;
  extra?: string;
}) {
  return (
    <button
      onClick={() => onOpen(c)}
      className="w-full text-start rounded-md bg-background/40 hover:bg-background/60 border border-border/30 px-2.5 py-1.5 transition-colors flex items-center justify-between gap-2"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{c.title}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {c.case_number}{c.client_name ? ` · ${c.client_name}` : ""}
        </p>
      </div>
      {extra && (
        <span className="text-[10px] text-muted-foreground bg-background/40 border border-border/40 rounded-full px-1.5 py-0.5 shrink-0">
          {extra}
        </span>
      )}
    </button>
  );
}

