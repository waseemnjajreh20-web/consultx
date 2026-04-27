/**
 * E7.10C — Dashboard widget that surfaces "my open tasks".
 *
 * Renders the tasks where assigned_to = the current user, with status NOT IN
 * (completed, cancelled). Grouped by priority and ordered by due_at. Clicking
 * a row navigates the workspace to the related case via the supplied callback.
 */

import { useMemo } from "react";
import { AlertOctagon, CalendarDays, ClipboardList, Flag, Loader2 } from "lucide-react";
import { useOrganization, type MyCaseTaskRow } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";

type TaskStatus = "open" | "in_progress" | "blocked" | "submitted";
type TaskPriority = "urgent" | "high" | "normal" | "low";

const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

const STATUS_LABEL: Record<string, { ar: string; en: string; cls: string }> = {
  open:        { ar: "مفتوحة",       en: "Open",        cls: "bg-blue-500/10 text-blue-300 border-blue-500/30" },
  in_progress: { ar: "قيد التنفيذ",   en: "In progress", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  blocked:     { ar: "متوقفة",       en: "Blocked",     cls: "bg-red-500/10 text-red-300 border-red-500/30" },
  submitted:   { ar: "مُقدَّمة",      en: "Submitted",   cls: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
};

const PRIORITY_LABEL: Record<TaskPriority, { ar: string; en: string; cls: string }> = {
  urgent: { ar: "عاجلة",   en: "Urgent", cls: "text-red-400" },
  high:   { ar: "عالية",   en: "High",   cls: "text-orange-400" },
  normal: { ar: "عادية",   en: "Normal", cls: "text-muted-foreground" },
  low:    { ar: "منخفضة",  en: "Low",    cls: "text-slate-400" },
};

interface Props {
  ar: boolean;
  onOpenCase?: (caseId: string) => void;
}

export default function MyTasksWidget({ ar, onOpenCase }: Props) {
  const { myTasks, myTasksLoading, transitionCaseTask } = useOrganization();

  const sorted = useMemo<MyCaseTaskRow[]>(() => {
    return [...myTasks].sort((a, b) => {
      const pa = PRIORITY_ORDER[(a.priority as TaskPriority) ?? "normal"];
      const pb = PRIORITY_ORDER[(b.priority as TaskPriority) ?? "normal"];
      if (pa !== pb) return pa - pb;
      const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return ad - bd;
    });
  }, [myTasks]);

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          {ar ? "مهامي المفتوحة" : "My open tasks"}
          {sorted.length > 0 && (
            <span className="ms-1 text-[11px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
              {sorted.length}
            </span>
          )}
        </p>
      </div>

      {myTasksLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          {ar ? "جارٍ التحميل…" : "Loading…"}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3">
          {ar ? "لا توجد مهام مفتوحة. أحسنت!" : "No open tasks. Nice work."}
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.slice(0, 8).map((t) => {
            const status = STATUS_LABEL[t.status] ?? STATUS_LABEL.open;
            const priority = PRIORITY_LABEL[(t.priority as TaskPriority) ?? "normal"];
            const dueLabel = t.due_at ? new Date(t.due_at).toLocaleDateString(ar ? "ar-SA" : "en-US") : null;
            const overdue = !!t.due_at && new Date(t.due_at) < new Date();
            return (
              <li
                key={t.id}
                className="rounded-md border border-border/30 bg-muted/10 px-3 py-2 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenCase?.(t.case_id)}
                    className="min-w-0 text-start"
                  >
                    <p className="text-sm font-medium leading-snug truncate">{t.title}</p>
                    {t.enterprise_cases && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        <span className="font-mono">{t.enterprise_cases.case_number}</span>
                        {" · "}
                        {t.enterprise_cases.title}
                      </p>
                    )}
                  </button>
                  <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${status.cls}`}>
                    {ar ? status.ar : status.en}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className={`inline-flex items-center gap-1 ${priority.cls}`}>
                      <Flag className="w-3 h-3" />
                      {ar ? priority.ar : priority.en}
                    </span>
                    {dueLabel && (
                      <span className={`inline-flex items-center gap-1 ${overdue ? "text-red-400" : ""}`}>
                        <CalendarDays className="w-3 h-3" />
                        {dueLabel}
                        {overdue && <AlertOctagon className="w-3 h-3" />}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {t.status === "open" && (
                      <Button
                        size="sm" variant="ghost"
                        className="h-6 text-[11px] px-2"
                        onClick={() => transitionCaseTask.mutate({ task_id: t.id, to_status: "in_progress", note: null, case_id: t.case_id })}
                      >
                        {ar ? "ابدأ" : "Start"}
                      </Button>
                    )}
                    {t.status === "in_progress" && (
                      <Button
                        size="sm" variant="ghost"
                        className="h-6 text-[11px] px-2"
                        onClick={() => transitionCaseTask.mutate({ task_id: t.id, to_status: "submitted", note: null, case_id: t.case_id })}
                      >
                        {ar ? "تقديم" : "Submit"}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {sorted.length > 8 && (
            <li className="text-[11px] text-muted-foreground text-center pt-1">
              {ar ? `+${sorted.length - 8} مهام إضافية` : `+${sorted.length - 8} more`}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
