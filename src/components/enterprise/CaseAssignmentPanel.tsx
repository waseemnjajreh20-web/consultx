/**
 * E7.10C — Case assignment panel.
 *
 * Sets enterprise_cases.assigned_engineer_id and head_reviewer_id via the
 * assign_enterprise_case RPC. Restricted to owner / admin / head_of_department.
 *
 * This is the surface that unblocks the existing review/approval workflow:
 * transition_case_status hard-fails the submitted_to_head transition when
 * head_reviewer_id is NULL, and the UI had no path to set either FK.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Save, ShieldCheck, UserCog, UserSquare2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";

// Engineer / head_of_department / owner / admin can be assigned.
const ASSIGNABLE_ENGINEER_ROLES = new Set(["engineer", "head_of_department", "owner", "admin"]);
// Only head_of_department or owner can be the head reviewer.
const HEAD_REVIEWER_ROLES = new Set(["head_of_department", "owner"]);

interface Props {
  caseId: string;
  caseStatus: string;
  currentAssignedEngineerId: string | null;
  currentHeadReviewerId: string | null;
  ar: boolean;
}

export default function CaseAssignmentPanel({
  caseId, caseStatus, currentAssignedEngineerId, currentHeadReviewerId, ar,
}: Props) {
  const { toast } = useToast();
  const {
    members, orgRole, resolveDisplay, refetchCases,
  } = useOrganization();

  const isManager = orgRole === "owner" || orgRole === "admin" || orgRole === "head_of_department";

  // The Select values use the special token "__none__" to mean "unassigned"
  // because Radix Select rejects empty-string item values.
  const [engineerId, setEngineerId] = useState<string>(currentAssignedEngineerId ?? "__none__");
  const [headReviewerId, setHeadReviewerId] = useState<string>(currentHeadReviewerId ?? "__none__");

  useEffect(() => {
    setEngineerId(currentAssignedEngineerId ?? "__none__");
    setHeadReviewerId(currentHeadReviewerId ?? "__none__");
  }, [currentAssignedEngineerId, currentHeadReviewerId, caseId]);

  const engineerCandidates = useMemo(
    () => members.filter((m) => m.status === "active" && ASSIGNABLE_ENGINEER_ROLES.has(m.role)),
    [members],
  );
  const headCandidates = useMemo(
    () => members.filter((m) => m.status === "active" && HEAD_REVIEWER_ROLES.has(m.role)),
    [members],
  );

  const dirty =
    (engineerId === "__none__" ? null : engineerId) !== currentAssignedEngineerId ||
    (headReviewerId === "__none__" ? null : headReviewerId) !== currentHeadReviewerId;

  const assignMutation = useMutation({
    mutationFn: async () => {
      // Only send the columns that actually changed -- the RPC treats NULL
      // params as "leave alone" via COALESCE. This avoids accidentally
      // clobbering the other field if a manager edits one independently.
      const engineerNew = engineerId === "__none__" ? null : engineerId;
      const headNew = headReviewerId === "__none__" ? null : headReviewerId;

      const payload: { p_case_id: string; p_assigned_engineer_id: string | null; p_head_reviewer_id: string | null; p_note: string | null } = {
        p_case_id: caseId,
        p_assigned_engineer_id: null,
        p_head_reviewer_id: null,
        p_note: null,
      };
      if (engineerNew !== currentAssignedEngineerId) payload.p_assigned_engineer_id = engineerNew;
      if (headNew !== currentHeadReviewerId) payload.p_head_reviewer_id = headNew;

      const { error } = await supabase.rpc("assign_enterprise_case", payload);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: ar ? "تم حفظ التعيينات" : "Assignments saved" });
      refetchCases();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    },
  });

  const memberLabel = (memberId: string) => {
    const m = members.find((x) => x.user_id === memberId);
    if (!m) return ar ? "(غير متاح)" : "(unavailable)";
    return resolveDisplay({ id: m.id, user_id: m.user_id, role: m.role }).displayName;
  };

  // Workflow blocker hints — surface the unblock guidance directly.
  const needsHeadForApproval = caseStatus === "submitted_to_head" || caseStatus === "engineer_review_completed";
  const needsEngineer = caseStatus === "submitted" || caseStatus === "assigned" ||
    caseStatus === "under_engineering_review" || caseStatus === "ai_review_attached";

  return (
    <div className="rounded-lg border border-border/40 bg-card/40 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <UserCog className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">{ar ? "تعيين المسؤولين" : "Case responsibilities"}</p>
      </div>

      {!isManager && (
        <p className="text-xs text-muted-foreground rounded-md border border-border/30 bg-muted/10 px-3 py-2">
          {ar
            ? "يمكنك مراجعة التعيينات الحالية فقط — التعديل متاح لمالك/مدير/رئيس قسم."
            : "View-only — assignment changes require owner / admin / head of department."}
        </p>
      )}

      {/* Engineer */}
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1.5">
          <UserSquare2 className="w-3.5 h-3.5 text-muted-foreground" />
          {ar ? "المهندس المسؤول" : "Assigned engineer"}
        </Label>
        {isManager ? (
          <Select value={engineerId} onValueChange={setEngineerId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder={ar ? "اختر مهندس" : "Pick an engineer"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{ar ? "بدون تعيين" : "Unassigned"}</SelectItem>
              {engineerCandidates.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {memberLabel(m.user_id)} <span className="text-muted-foreground text-[11px] ms-1">· {m.role}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm rounded-md border border-border/30 bg-muted/10 px-3 py-2">
            {currentAssignedEngineerId
              ? memberLabel(currentAssignedEngineerId)
              : <span className="text-muted-foreground">{ar ? "بدون تعيين" : "Unassigned"}</span>}
          </p>
        )}
        {needsEngineer && !currentAssignedEngineerId && (
          <p className="text-[11px] text-amber-300 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1">
            {ar ? "عيّن مهندس مسؤول حتى يبدأ سير العمل." : "Assign an engineer to unblock the workflow."}
          </p>
        )}
      </div>

      {/* Head reviewer */}
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
          {ar ? "رئيس القسم المعتمد" : "Head reviewer"}
        </Label>
        {isManager ? (
          <Select value={headReviewerId} onValueChange={setHeadReviewerId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder={ar ? "اختر رئيس قسم" : "Pick a head reviewer"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{ar ? "بدون تعيين" : "Unassigned"}</SelectItem>
              {headCandidates.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {memberLabel(m.user_id)} <span className="text-muted-foreground text-[11px] ms-1">· {m.role}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm rounded-md border border-border/30 bg-muted/10 px-3 py-2">
            {currentHeadReviewerId
              ? memberLabel(currentHeadReviewerId)
              : <span className="text-muted-foreground">{ar ? "بدون تعيين" : "Unassigned"}</span>}
          </p>
        )}
        {needsHeadForApproval && !currentHeadReviewerId && (
          <p className="text-[11px] text-amber-300 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1">
            {ar
              ? "عيّن رئيس قسم قبل الإرسال للاعتماد."
              : "Assign a head reviewer before the case can be submitted for approval."}
          </p>
        )}
        {headCandidates.length === 0 && isManager && (
          <p className="text-[11px] text-muted-foreground rounded-md border border-border/30 bg-muted/10 px-2 py-1">
            {ar
              ? "لا يوجد عضو بدور رئيس قسم/مالك بعد. أضف عضوًا بهذا الدور أولًا."
              : "No member with role head_of_department or owner yet — invite or promote one first."}
          </p>
        )}
      </div>

      {isManager && (
        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!dirty || assignMutation.isPending}
            onClick={() => assignMutation.mutate()}
          >
            {assignMutation.isSuccess && !dirty ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {assignMutation.isPending
              ? (ar ? "جارٍ الحفظ…" : "Saving…")
              : (ar ? "حفظ التعيينات" : "Save assignments")}
          </Button>
        </div>
      )}
    </div>
  );
}
