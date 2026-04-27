/**
 * E7.10C — Case tasks panel inside CaseDetailDrawer.
 *
 * Lists case_tasks for a case, allows creation, edit (assignee/priority/due),
 * and status transitions through transition_case_task. Renders the task
 * events timeline below the list. All writes go through SECURITY DEFINER
 * RPCs.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertOctagon, CalendarDays, CheckCircle2, ClipboardList, Clock, Flag,
  Loader2, Pause, Play, Plus, Send, Undo2, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";

type TaskStatus = "open" | "in_progress" | "blocked" | "submitted" | "completed" | "cancelled";
type TaskPriority = "low" | "normal" | "high" | "urgent";

interface CaseTaskRow {
  id: string;
  org_id: string;
  case_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface CaseTaskEventRow {
  id: string;
  task_id: string;
  from_status: string | null;
  to_status: string;
  actor_user_id: string;
  note: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<TaskStatus, { ar: string; en: string; cls: string }> = {
  open:        { ar: "مفتوحة",       en: "Open",        cls: "bg-blue-500/10 text-blue-300 border-blue-500/30" },
  in_progress: { ar: "قيد التنفيذ",   en: "In progress", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  blocked:     { ar: "متوقفة",       en: "Blocked",     cls: "bg-red-500/10 text-red-300 border-red-500/30" },
  submitted:   { ar: "مُقدَّمة",      en: "Submitted",   cls: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
  completed:   { ar: "مكتملة",       en: "Completed",   cls: "bg-green-500/10 text-green-300 border-green-500/30" },
  cancelled:   { ar: "ملغاة",        en: "Cancelled",   cls: "bg-muted/40 text-muted-foreground border-border/40" },
};

const PRIORITY_LABELS: Record<TaskPriority, { ar: string; en: string; cls: string }> = {
  low:    { ar: "منخفضة",  en: "Low",     cls: "text-slate-400" },
  normal: { ar: "عادية",   en: "Normal",  cls: "text-muted-foreground" },
  high:   { ar: "عالية",   en: "High",    cls: "text-orange-400" },
  urgent: { ar: "عاجلة",   en: "Urgent",  cls: "text-red-400" },
};

interface Props {
  caseId: string;
  orgId: string;
  ar: boolean;
}

export default function CaseTasksPanel({ caseId, orgId, ar }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { members, orgRole, resolveDisplay, createCaseTask, updateCaseTask, transitionCaseTask, cases } = useOrganization();
  const [showCreate, setShowCreate] = useState(false);

  const isManager = orgRole === "owner" || orgRole === "admin" || orgRole === "head_of_department";
  const isFinance = orgRole === "finance_officer";

  // Fetch tasks for this case
  const tasksQuery = useQuery<CaseTaskRow[]>({
    queryKey: ["case_tasks", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_tasks")
        .select("*")
        .eq("case_id", caseId)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CaseTaskRow[];
    },
    staleTime: 30 * 1000,
  });

  // Fetch task events for this case (timeline)
  const eventsQuery = useQuery<CaseTaskEventRow[]>({
    queryKey: ["case_task_events", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_task_events")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as CaseTaskEventRow[];
    },
    staleTime: 30 * 1000,
  });

  const memberByUserId = useMemo(() => {
    const map = new Map<string, { id: string; user_id: string; role: string }>();
    for (const m of members) map.set(m.user_id, { id: m.id, user_id: m.user_id, role: m.role });
    return map;
  }, [members]);

  const memberDisplayName = (userId: string | null): string => {
    if (!userId) return ar ? "(بدون تعيين)" : "(unassigned)";
    const m = memberByUserId.get(userId);
    if (!m) return ar ? "(غير متاح)" : "(unavailable)";
    return resolveDisplay(m).displayName;
  };

  const currentCase = useMemo(() => cases.find((c) => c.id === caseId), [cases, caseId]);
  const isAssignedEngineer = currentCase?.assigned_engineer_id === memberByUserId.get(currentCase?.assigned_engineer_id ?? "")?.user_id;

  if (isFinance) {
    return (
      <div className="rounded-lg border border-border/30 bg-muted/10 p-4 text-sm text-muted-foreground">
        {ar ? "هذه الخصائص غير متاحة للمالية." : "Tasks are not available for finance officers."}
      </div>
    );
  }

  // Engineers can create tasks only on a case where they are the assigned engineer.
  const canCreateTask = isManager || (orgRole === "engineer" && isAssignedEngineer);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/40 bg-card/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            {ar ? "مهام القضية" : "Case tasks"}
          </p>
          {canCreateTask && (
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" />
              {ar ? "مهمة جديدة" : "New task"}
            </Button>
          )}
        </div>

        {tasksQuery.isLoading ? (
          <Skeleton />
        ) : (tasksQuery.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">
            {ar ? "لا توجد مهام بعد." : "No tasks yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {(tasksQuery.data ?? []).map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                ar={ar}
                isManager={isManager}
                isAssignee={!!task.assigned_to && memberByUserId.get(task.assigned_to)?.user_id === task.assigned_to && task.assigned_to === currentCase?.assigned_engineer_id}
                memberDisplayName={memberDisplayName}
                onTransition={(toStatus, note) =>
                  transitionCaseTask.mutate(
                    { task_id: task.id, to_status: toStatus, note: note ?? null, case_id: caseId },
                    {
                      onError: (err) => {
                        const msg = err instanceof Error ? err.message : String(err);
                        toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
                      },
                    },
                  )
                }
                onUpdate={(patch) =>
                  updateCaseTask.mutate(
                    { task_id: task.id, ...patch, case_id: caseId },
                    {
                      onError: (err) => {
                        const msg = err instanceof Error ? err.message : String(err);
                        toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
                      },
                    },
                  )
                }
                members={members.filter((m) => m.status === "active" && m.role !== "finance_officer")}
                resolveDisplay={resolveDisplay}
              />
            ))}
          </div>
        )}
      </div>

      {/* Task events timeline */}
      <div className="rounded-lg border border-border/40 bg-card/40 p-4 space-y-2">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          {ar ? "سجل المهام" : "Task activity"}
        </p>
        {eventsQuery.isLoading ? (
          <Skeleton />
        ) : (eventsQuery.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">{ar ? "لا يوجد نشاط بعد." : "No activity yet."}</p>
        ) : (
          <ol className="relative ms-2 space-y-2 border-s border-border/20 ps-3">
            {(eventsQuery.data ?? []).map((ev) => {
              const ts = new Date(ev.created_at).toLocaleString(ar ? "ar-SA" : "en-US");
              const taskTitle = (tasksQuery.data ?? []).find((t) => t.id === ev.task_id)?.title;
              return (
                <li key={ev.id} className="relative">
                  <span className="absolute -start-[15px] top-2 w-2 h-2 rounded-full bg-muted-foreground/50" />
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[11px] text-muted-foreground">
                      {ev.from_status ? `${ev.from_status} → ${ev.to_status}` : ev.to_status}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">{ts}</span>
                  </div>
                  {taskTitle && <p className="text-xs leading-snug truncate">{taskTitle}</p>}
                  <p className="text-[10px] text-muted-foreground/60">{memberDisplayName(ev.actor_user_id)}</p>
                  {ev.note && <p className="text-[11px] text-muted-foreground mt-0.5">{ev.note}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {showCreate && (
        <CreateTaskDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          ar={ar}
          orgId={orgId}
          caseId={caseId}
          createTask={createCaseTask}
          members={members.filter((m) => m.status === "active" && m.role !== "finance_officer")}
          resolveDisplay={resolveDisplay}
          onCreated={() => qc.invalidateQueries({ queryKey: ["case_tasks", caseId] })}
        />
      )}
    </div>
  );
}

function Skeleton() {
  return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded bg-muted/20 animate-pulse" />)}</div>;
}

function TaskRow({
  task, ar, isManager, isAssignee, memberDisplayName, onTransition, onUpdate, members, resolveDisplay,
}: {
  task: CaseTaskRow;
  ar: boolean;
  isManager: boolean;
  isAssignee: boolean;
  memberDisplayName: (userId: string | null) => string;
  onTransition: (toStatus: TaskStatus, note?: string | null) => void;
  onUpdate: (patch: { title?: string | null; description?: string | null; assigned_to?: string | null; priority?: string | null; due_at?: string | null }) => void;
  members: Array<{ id: string; user_id: string; role: string; status: string }>;
  resolveDisplay: (m: { id: string; user_id: string; role: string }) => { displayName: string };
}) {
  const status = STATUS_LABELS[task.status];
  const priority = PRIORITY_LABELS[task.priority];
  const dueLabel = task.due_at ? new Date(task.due_at).toLocaleDateString(ar ? "ar-SA" : "en-US") : null;
  const overdue = !!task.due_at && new Date(task.due_at) < new Date() && task.status !== "completed" && task.status !== "cancelled";

  // Allowed transitions (mirrors the SQL state machine, manager additions on top).
  const allowed = useMemo<{ status: TaskStatus; label: string; icon: React.ReactNode }[]>(() => {
    const base: { status: TaskStatus; label: string; icon: React.ReactNode }[] = [];
    switch (task.status) {
      case "open":
        base.push({ status: "in_progress", label: ar ? "ابدأ التنفيذ" : "Start", icon: <Play className="w-3 h-3" /> });
        if (isManager || isAssignee) base.push({ status: "blocked", label: ar ? "إيقاف مؤقت" : "Block", icon: <Pause className="w-3 h-3" /> });
        if (isManager) base.push({ status: "cancelled", label: ar ? "إلغاء" : "Cancel", icon: <X className="w-3 h-3" /> });
        break;
      case "in_progress":
        base.push({ status: "submitted", label: ar ? "تقديم" : "Submit", icon: <Send className="w-3 h-3" /> });
        if (isManager || isAssignee) base.push({ status: "blocked", label: ar ? "متوقفة" : "Block", icon: <Pause className="w-3 h-3" /> });
        if (isManager) base.push({ status: "completed", label: ar ? "مكتملة" : "Complete", icon: <CheckCircle2 className="w-3 h-3" /> });
        if (isManager) base.push({ status: "cancelled", label: ar ? "إلغاء" : "Cancel", icon: <X className="w-3 h-3" /> });
        break;
      case "blocked":
        base.push({ status: "in_progress", label: ar ? "استئناف" : "Resume", icon: <Play className="w-3 h-3" /> });
        if (isManager) base.push({ status: "cancelled", label: ar ? "إلغاء" : "Cancel", icon: <X className="w-3 h-3" /> });
        break;
      case "submitted":
        if (isManager) base.push({ status: "completed", label: ar ? "اعتماد" : "Approve", icon: <CheckCircle2 className="w-3 h-3" /> });
        base.push({ status: "in_progress", label: ar ? "إعادة فتح" : "Reopen", icon: <Undo2 className="w-3 h-3" /> });
        if (isManager) base.push({ status: "cancelled", label: ar ? "إلغاء" : "Cancel", icon: <X className="w-3 h-3" /> });
        break;
      case "completed":
        if (isManager) base.push({ status: "in_progress", label: ar ? "إعادة فتح" : "Reopen", icon: <Undo2 className="w-3 h-3" /> });
        break;
      case "cancelled":
        // terminal
        break;
    }
    return base;
  }, [task.status, isManager, isAssignee, ar]);

  const [editing, setEditing] = useState(false);
  const [draftAssignee, setDraftAssignee] = useState(task.assigned_to ?? "__none__");
  const [draftPriority, setDraftPriority] = useState<string>(task.priority);
  const [draftDue, setDraftDue] = useState(task.due_at ? task.due_at.slice(0, 10) : "");

  useEffect(() => {
    setDraftAssignee(task.assigned_to ?? "__none__");
    setDraftPriority(task.priority);
    setDraftDue(task.due_at ? task.due_at.slice(0, 10) : "");
  }, [task.assigned_to, task.priority, task.due_at]);

  const dirtyEdit =
    (draftAssignee === "__none__" ? null : draftAssignee) !== task.assigned_to ||
    draftPriority !== task.priority ||
    (draftDue ? new Date(draftDue + "T00:00:00").toISOString() : null) !== task.due_at;

  const saveEdits = () => {
    onUpdate({
      assigned_to: draftAssignee === "__none__" ? null : draftAssignee,
      priority: draftPriority,
      due_at: draftDue ? new Date(draftDue + "T00:00:00").toISOString() : null,
    });
    setEditing(false);
  };

  return (
    <div className="rounded-md border border-border/30 bg-muted/10 px-3 py-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{task.title}</p>
          {task.description && (
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 whitespace-pre-line">{task.description}</p>
          )}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${status.cls}`}>
          {ar ? status.ar : status.en}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className={`inline-flex items-center gap-1 ${priority.cls}`}>
          <Flag className="w-3 h-3" />
          {ar ? priority.ar : priority.en}
        </span>
        <span className="inline-flex items-center gap-1">
          <ClipboardList className="w-3 h-3" />
          {memberDisplayName(task.assigned_to)}
        </span>
        {dueLabel && (
          <span className={`inline-flex items-center gap-1 ${overdue ? "text-red-400" : ""}`}>
            <CalendarDays className="w-3 h-3" />
            {dueLabel}
            {overdue && <AlertOctagon className="w-3 h-3" />}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {allowed.map((a) => (
          <Button key={a.status} size="sm" variant="outline" className="gap-1 h-7 text-[11px]" onClick={() => onTransition(a.status, null)}>
            {a.icon}
            {a.label}
          </Button>
        ))}
        {isManager && (
          editing ? (
            <Button size="sm" variant="ghost" className="gap-1 h-7 text-[11px]" onClick={() => setEditing(false)}>
              {ar ? "إغلاق" : "Close"}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="gap-1 h-7 text-[11px]" onClick={() => setEditing(true)}>
              {ar ? "تحرير" : "Edit"}
            </Button>
          )
        )}
      </div>

      {editing && isManager && (
        <div className="rounded-md border border-border/30 bg-background/40 p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">{ar ? "المسؤول" : "Assignee"}</Label>
              <Select value={draftAssignee} onValueChange={setDraftAssignee}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{ar ? "بدون" : "Unassigned"}</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {resolveDisplay({ id: m.id, user_id: m.user_id, role: m.role }).displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{ar ? "الأولوية" : "Priority"}</Label>
              <Select value={draftPriority} onValueChange={setDraftPriority}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["low","normal","high","urgent"] as const).map((p) => (
                    <SelectItem key={p} value={p}>{ar ? PRIORITY_LABELS[p].ar : PRIORITY_LABELS[p].en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{ar ? "تاريخ الاستحقاق" : "Due date"}</Label>
              <Input type="date" value={draftDue} onChange={(e) => setDraftDue(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={!dirtyEdit} onClick={saveEdits}>{ar ? "حفظ" : "Save"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTaskDialog({
  open, onClose, ar, orgId, caseId, createTask, members, resolveDisplay, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  ar: boolean;
  orgId: string;
  caseId: string;
  createTask: ReturnType<typeof useOrganization>["createCaseTask"];
  members: Array<{ id: string; user_id: string; role: string; status: string }>;
  resolveDisplay: (m: { id: string; user_id: string; role: string }) => { displayName: string };
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>("__none__");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [due, setDue] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    createTask.mutate(
      {
        case_id: caseId,
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignee === "__none__" ? null : assignee,
        priority,
        due_at: due ? new Date(due + "T00:00:00").toISOString() : null,
      },
      {
        onSuccess: () => { onCreated(); onClose(); },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" dir={ar ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="text-base">{ar ? "مهمة جديدة" : "New task"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{ar ? "العنوان *" : "Title *"}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{ar ? "الوصف" : "Description"}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="text-sm resize-none min-h-[72px]" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{ar ? "المسؤول" : "Assignee"}</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{ar ? "بدون" : "Unassigned"}</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {resolveDisplay({ id: m.id, user_id: m.user_id, role: m.role }).displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{ar ? "الأولوية" : "Priority"}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["low","normal","high","urgent"] as const).map((p) => (
                    <SelectItem key={p} value={p}>{ar ? PRIORITY_LABELS[p].ar : PRIORITY_LABELS[p].en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{ar ? "الاستحقاق" : "Due"}</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={createTask.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={!title.trim() || createTask.isPending} className="gap-1.5">
            {createTask.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {ar ? "إنشاء" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
