import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  MessageSquare,
  RotateCcw,
  Send,
  Shield,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import type { useOrganization } from "@/hooks/useOrganization";

type Case = ReturnType<typeof useOrganization>["cases"][number];

interface CaseDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  case_: Case | null;
  orgId: string;
  currentUserId?: string;
  orgRole?: string | null;
}

const STATUS_BADGE: Record<string, { en: string; ar: string; cls: string }> = {
  draft:                    { en: "Draft",                   ar: "مسودة",                    cls: "bg-muted/40 text-muted-foreground border-border/40" },
  submitted:                { en: "Submitted",               ar: "مُقدَّمة",                   cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  assigned:                 { en: "Assigned",                ar: "موكَلة",                   cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  under_engineering_review: { en: "Under engineering review",ar: "قيد المراجعة الهندسية",    cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  ai_review_attached:       { en: "AI review attached",      ar: "مراجعة ذكية مرفقة",         cls: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  engineer_review_completed:{ en: "Engineer review done",    ar: "اكتملت المراجعة الهندسية",  cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  submitted_to_head:        { en: "Submitted to head",       ar: "مرفوعة لرئيس القسم",        cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  returned_for_revision:    { en: "Returned for revision",   ar: "مُعادة للتعديل",             cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  approved_internal:        { en: "Approved (internal)",     ar: "اعتماد داخلي",              cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  delivered_to_client:      { en: "Delivered to client",     ar: "مُسلَّمة للعميل",            cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  closed:                   { en: "Closed",                  ar: "مغلقة",                    cls: "bg-muted/40 text-muted-foreground border-border/40" },
  cancelled:                { en: "Cancelled",               ar: "ملغاة",                    cls: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const AI_DECISION_BADGE: Record<string, { en: string; ar: string; cls: string }> = {
  pending:             { en: "Pending",            ar: "قيد المراجعة",      cls: "bg-muted/40 text-muted-foreground border-border/40" },
  accepted:            { en: "Accepted",           ar: "مقبولة",            cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  rejected:            { en: "Rejected",           ar: "مرفوضة",            cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  accepted_with_notes: { en: "Accepted (notes)",   ar: "مقبولة مع ملاحظات", cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  needs_revision:      { en: "Needs revision",     ar: "تحتاج مراجعة",      cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
};

function shortUid(uid: string) {
  return `…${uid.slice(-6)}`;
}

export default function CaseDetailDrawer({
  open,
  onClose,
  case_,
  orgId,
  currentUserId,
  orgRole,
}: CaseDetailDrawerProps) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("overview");

  if (!case_) return null;

  const caseId = case_.id;
  const statusLabel = STATUS_BADGE[case_.status] ?? STATUS_BADGE.draft;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-2xl w-full h-[90dvh] flex flex-col gap-0 p-0 overflow-hidden"
        dir={ar ? "rtl" : "ltr"}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold leading-snug truncate">
                {case_.title}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusLabel.cls}`}>
                  {ar ? statusLabel.ar : statusLabel.en}
                </span>
                <span className="text-xs text-muted-foreground font-mono">{case_.case_number}</span>
                {case_.client_name && (
                  <span className="text-xs text-muted-foreground">· {case_.client_name}</span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0" dir={ar ? "rtl" : "ltr"}>
          <TabsList className="mx-4 mt-3 mb-0 h-auto gap-0.5 bg-card/40 p-1 shrink-0 flex flex-wrap">
            <TabsTrigger value="overview"  className="text-[11px] gap-1"><ClipboardList className="w-3 h-3" />{ar ? "نظرة عامة" : "Overview"}</TabsTrigger>
            <TabsTrigger value="timeline"  className="text-[11px] gap-1"><Clock className="w-3 h-3" />{ar ? "التاريخ" : "Timeline"}</TabsTrigger>
            <TabsTrigger value="discussion"className="text-[11px] gap-1"><MessageSquare className="w-3 h-3" />{ar ? "النقاش" : "Discussion"}</TabsTrigger>
            <TabsTrigger value="reviews"   className="text-[11px] gap-1"><Shield className="w-3 h-3" />{ar ? "المراجعات" : "Reviews"}</TabsTrigger>
            <TabsTrigger value="ai"        className="text-[11px] gap-1"><Bot className="w-3 h-3" />{ar ? "أدلة الذكاء" : "AI Evidence"}</TabsTrigger>
            <TabsTrigger value="documents" className="text-[11px] gap-1"><FileText className="w-3 h-3" />{ar ? "المستندات" : "Documents"}</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {/* Overview */}
            <TabsContent value="overview" className="mt-0 space-y-3">
              <OverviewTab case_={case_} ar={ar} />
            </TabsContent>

            {/* Timeline */}
            <TabsContent value="timeline" className="mt-0">
              <TimelineTab caseId={caseId} ar={ar} />
            </TabsContent>

            {/* Discussion */}
            <TabsContent value="discussion" className="mt-0">
              <DiscussionTab
                caseId={caseId}
                orgId={orgId}
                currentUserId={currentUserId}
                ar={ar}
                toast={toast}
                qc={qc}
              />
            </TabsContent>

            {/* Reviews & Approvals */}
            <TabsContent value="reviews" className="mt-0">
              <ReviewsTab
                case_={case_}
                orgId={orgId}
                currentUserId={currentUserId}
                orgRole={orgRole}
                ar={ar}
                toast={toast}
                qc={qc}
              />
            </TabsContent>

            {/* AI Evidence */}
            <TabsContent value="ai" className="mt-0">
              <AIEvidenceTab caseId={caseId} ar={ar} />
            </TabsContent>

            {/* Documents */}
            <TabsContent value="documents" className="mt-0">
              <DocumentsTab caseId={caseId} ar={ar} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────────

function OverviewTab({ case_, ar }: { case_: Case; ar: boolean }) {
  const fields: { labelEn: string; labelAr: string; value: string | null | undefined }[] = [
    { labelEn: "Case Number",    labelAr: "رقم القضية",    value: case_.case_number },
    { labelEn: "Client",         labelAr: "العميل",        value: case_.client_name },
    { labelEn: "Client Ref",     labelAr: "المرجع",        value: case_.client_ref },
    { labelEn: "Description",    labelAr: "الوصف",         value: case_.description },
    { labelEn: "Created",        labelAr: "تاريخ الإنشاء", value: new Date(case_.created_at).toLocaleDateString(ar ? "ar-SA" : "en-US", { year: "numeric", month: "long", day: "numeric" }) },
  ];

  return (
    <div className="space-y-3">
      {fields.map((f) => f.value ? (
        <div key={f.labelEn} className="rounded-lg bg-muted/10 border border-border/30 px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground mb-0.5">{ar ? f.labelAr : f.labelEn}</p>
          <p className="text-sm leading-relaxed">{f.value}</p>
        </div>
      ) : null)}
    </div>
  );
}

// ─── Timeline ───────────────────────────────────────────────────────────────

function TimelineTab({ caseId, ar }: { caseId: string; ar: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["case_timeline", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_status_history")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });

  if (isLoading) return <Skeleton rows={4} />;
  if (!data || data.length === 0) {
    return <Empty ar={ar} msg={ar ? "لا يوجد تاريخ بعد" : "No history yet"} />;
  }

  return (
    <div className="relative space-y-0">
      <div className="absolute start-[13px] top-3 bottom-3 w-px bg-border/40" />
      {data.map((entry, i) => (
        <div key={entry.id ?? i} className="flex gap-3 pb-4 relative">
          <div className="w-6.5 h-6.5 rounded-full bg-card border border-border/60 flex items-center justify-center shrink-0 z-10">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xs font-medium">{ar ? `← ${entry.to_status}` : `→ ${entry.to_status}`}</span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(entry.created_at).toLocaleString(ar ? "ar-SA" : "en-US")}
              </span>
            </div>
            {entry.note && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{entry.note}</p>
            )}
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">{shortUid(entry.actor_user_id)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Discussion ─────────────────────────────────────────────────────────────

function DiscussionTab({
  caseId, orgId, currentUserId, ar, toast, qc,
}: {
  caseId: string;
  orgId: string;
  currentUserId?: string;
  ar: boolean;
  toast: ReturnType<typeof useToast>["toast"];
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [body, setBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["case_notes", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_notes")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 1000,
  });

  const sendNote = useMutation({
    mutationFn: async (noteBody: string) => {
      const { error } = await supabase
        .from("case_notes")
        .insert({ case_id: caseId, org_id: orgId, author_id: currentUserId!, body: noteBody, visibility: "internal_only" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_notes", caseId] });
      setBody("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    },
  });

  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed || !currentUserId) return;
    sendNote.mutate(trimmed);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={ar ? "أضف ملاحظة داخلية…" : "Add an internal note…"}
          className="text-sm resize-none min-h-[72px]"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend(); }}
        />
        <Button
          size="icon"
          className="shrink-0 self-end h-9 w-9"
          onClick={handleSend}
          disabled={!body.trim() || sendNote.isPending}
          title={ar ? "إرسال (Ctrl+Enter)" : "Send (Ctrl+Enter)"}
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton rows={3} />
      ) : !data || data.length === 0 ? (
        <Empty ar={ar} msg={ar ? "لا توجد ملاحظات بعد" : "No notes yet"} />
      ) : (
        <div className="space-y-2">
          {data.map((note) => (
            <div key={note.id} className="rounded-lg bg-muted/10 border border-border/30 px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-muted-foreground font-mono">{shortUid(note.author_id)}</span>
                {note.author_id === currentUserId && (
                  <Badge variant="outline" className="text-[9px] border-primary/30 text-primary">{ar ? "أنت" : "you"}</Badge>
                )}
                <span className="text-[10px] text-muted-foreground/60 ms-auto">
                  {new Date(note.created_at).toLocaleString(ar ? "ar-SA" : "en-US")}
                </span>
              </div>
              <p className="text-sm leading-relaxed">{note.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reviews & Approvals ────────────────────────────────────────────────────

function ReviewsTab({
  case_, orgId, currentUserId, orgRole, ar, toast, qc,
}: {
  case_: Case;
  orgId: string;
  currentUserId?: string;
  orgRole?: string | null;
  ar: boolean;
  toast: ReturnType<typeof useToast>["toast"];
  qc: ReturnType<typeof useQueryClient>;
}) {
  const caseId = case_.id;
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [summary, setSummary]   = useState("");
  const [recommendation, setRec] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [showApprovalForm, setShowApprovalForm] = useState(false);

  const canSubmitReview = (orgRole === "engineer" || orgRole === "owner" || orgRole === "admin" || orgRole === "head_of_department")
    && (case_.status === "engineer_review_completed" || case_.status === "returned_for_revision");

  const canDecideApproval = (orgRole === "owner" || orgRole === "head_of_department")
    && case_.status === "submitted_to_head";

  const { data: reviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ["case_reviews", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_reviews")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });

  const { data: approvals, isLoading: approvalsLoading } = useQuery({
    queryKey: ["case_approvals", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_approvals")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });

  const submitReview = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("submit_case_review", {
        p_case_id:        caseId,
        p_summary:        summary,
        p_findings:       {},
        p_recommendation: recommendation,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_reviews", caseId] });
      qc.invalidateQueries({ queryKey: ["enterprise_cases", orgId] });
      toast({ title: ar ? "تم تقديم المراجعة" : "Review submitted" });
      setShowSubmitForm(false);
      setSummary("");
      setRec("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    },
  });

  const decideApproval = useMutation({
    mutationFn: async (decision: "approved" | "returned_for_revision") => {
      const { error } = await supabase.rpc("decide_case_approval", {
        p_case_id:      caseId,
        p_decision:     decision,
        p_decision_note: approvalNote || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_approvals", caseId] });
      qc.invalidateQueries({ queryKey: ["enterprise_cases", orgId] });
      toast({ title: ar ? "تم تسجيل القرار" : "Decision recorded" });
      setShowApprovalForm(false);
      setApprovalNote("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      {/* Submit review CTA */}
      {canSubmitReview && !showSubmitForm && (
        <Button size="sm" variant="outline" onClick={() => setShowSubmitForm(true)} className="gap-1.5">
          <ClipboardList className="w-3.5 h-3.5" />
          {ar ? "تقديم مراجعة هندسية" : "Submit engineer review"}
        </Button>
      )}
      {showSubmitForm && (
        <div className="rounded-lg border border-border/40 bg-card/40 p-4 space-y-3">
          <p className="text-sm font-semibold">{ar ? "مراجعة هندسية جديدة" : "New engineer review"}</p>
          <div className="space-y-1.5">
            <Label className="text-xs">{ar ? "الملخص" : "Summary"}</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="text-sm resize-none min-h-[72px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{ar ? "التوصية" : "Recommendation"}</Label>
            <Input value={recommendation} onChange={(e) => setRec(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowSubmitForm(false)}>{ar ? "إلغاء" : "Cancel"}</Button>
            <Button size="sm" disabled={!summary.trim() || submitReview.isPending} onClick={() => submitReview.mutate()}>
              {submitReview.isPending ? (ar ? "جارٍ…" : "Saving…") : (ar ? "تقديم" : "Submit")}
            </Button>
          </div>
        </div>
      )}

      {/* Decide approval CTA */}
      {canDecideApproval && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {ar ? "القضية تنتظر قرارك" : "Case awaits your decision"}
          </p>
          {showApprovalForm ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">{ar ? "ملاحظة (مطلوبة عند الإعادة)" : "Note (required for return)"}</Label>
                <Textarea value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} className="text-sm resize-none min-h-[60px]" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700"
                  disabled={decideApproval.isPending} onClick={() => decideApproval.mutate("approved")}>
                  <ThumbsUp className="w-3.5 h-3.5" />{ar ? "اعتماد داخلي" : "Approve internally"}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-red-400 border-red-500/40"
                  disabled={!approvalNote.trim() || decideApproval.isPending} onClick={() => decideApproval.mutate("returned_for_revision")}>
                  <RotateCcw className="w-3.5 h-3.5" />{ar ? "إعادة للتعديل" : "Return for revision"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowApprovalForm(false)}>{ar ? "إلغاء" : "Cancel"}</Button>
              </div>
            </>
          ) : (
            <Button size="sm" onClick={() => setShowApprovalForm(true)}>{ar ? "تسجيل قرار" : "Record decision"}</Button>
          )}
        </div>
      )}

      {/* Reviews list */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">{ar ? "المراجعات الهندسية" : "Engineer reviews"}</p>
        {reviewsLoading ? <Skeleton rows={2} /> : !reviews?.length ? (
          <Empty ar={ar} msg={ar ? "لا توجد مراجعات بعد" : "No reviews yet"} />
        ) : (
          <div className="space-y-2">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-lg bg-muted/10 border border-border/30 p-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                    r.status === "accepted" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                    r.status === "submitted" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                    r.status === "returned" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                    "bg-muted/40 text-muted-foreground border-border/40"
                  }`}>{r.status}</span>
                  <span className="text-[10px] text-muted-foreground">{ar ? "مراجعة رقم" : "Rev."} {r.revision_number}</span>
                  <span className="text-[10px] text-muted-foreground/60 ms-auto font-mono">{shortUid(r.reviewer_user_id)}</span>
                </div>
                {r.summary && <p className="text-xs text-muted-foreground leading-relaxed">{r.summary}</p>}
                {r.recommendation && (
                  <p className="text-xs leading-relaxed"><span className="text-muted-foreground">{ar ? "التوصية: " : "Rec: "}</span>{r.recommendation}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approvals list */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">{ar ? "قرارات الاعتماد" : "Approval decisions"}</p>
        {approvalsLoading ? <Skeleton rows={1} /> : !approvals?.length ? (
          <Empty ar={ar} msg={ar ? "لا توجد قرارات بعد" : "No decisions yet"} />
        ) : (
          <div className="space-y-2">
            {approvals.map((a) => (
              <div key={a.id} className="rounded-lg bg-muted/10 border border-border/30 p-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {a.decision === "approved" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span className={`text-xs font-medium ${a.decision === "approved" ? "text-green-400" : "text-red-400"}`}>
                    {ar ? (a.decision === "approved" ? "معتمدة" : "مُعادة للتعديل") : (a.decision === "approved" ? "Approved" : "Returned for revision")}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 ms-auto font-mono">{shortUid(a.approver_user_id)}</span>
                </div>
                {a.decision_note && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{a.decision_note}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI Evidence ─────────────────────────────────────────────────────────────

function AIEvidenceTab({ caseId, ar }: { caseId: string; ar: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ai_report_versions", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_report_versions")
        .select("id, title, report_mode, version_number, engineer_decision, output_language, model_name, created_at, confidence_note")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });

  if (isLoading) return <Skeleton rows={3} />;
  if (!data || data.length === 0) {
    return <Empty ar={ar} msg={ar ? "لا توجد تقارير ذكاء اصطناعي مرفقة" : "No AI reports attached yet"} />;
  }

  return (
    <div className="space-y-2">
      {data.map((r) => {
        const decBadge = AI_DECISION_BADGE[r.engineer_decision] ?? AI_DECISION_BADGE.pending;
        return (
          <div key={r.id} className="rounded-lg bg-muted/10 border border-border/30 p-3 space-y-1.5">
            <div className="flex items-start gap-2">
              <Bot className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.title}</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${decBadge.cls}`}>
                    {ar ? decBadge.ar : decBadge.en}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{r.report_mode} · v{r.version_number}</span>
                  <span className="text-[10px] text-muted-foreground">{r.model_name}</span>
                </div>
                {r.confidence_note && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.confidence_note}</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Documents ───────────────────────────────────────────────────────────────

function DocumentsTab({ caseId, ar }: { caseId: string; ar: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["case_documents", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_documents")
        .select("id, title, category, visibility, created_at, uploaded_by")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });

  if (isLoading) return <Skeleton rows={3} />;
  if (!data || data.length === 0) {
    return <Empty ar={ar} msg={ar ? "لا توجد مستندات بعد" : "No documents yet"} />;
  }

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.id} className="rounded-lg bg-muted/10 border border-border/30 px-3 py-2.5 flex items-center gap-3">
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{d.title}</p>
            <p className="text-[10px] text-muted-foreground">{d.category} · {d.visibility}</p>
          </div>
          <span className="text-[10px] text-muted-foreground/60 shrink-0">
            {new Date(d.created_at).toLocaleDateString(ar ? "ar-SA" : "en-US")}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 rounded-lg bg-muted/20 animate-pulse" />
      ))}
    </div>
  );
}

function Empty({ ar, msg }: { ar: boolean; msg: string }) {
  return (
    <p className="text-sm text-muted-foreground text-center py-6">{msg}</p>
  );
}
