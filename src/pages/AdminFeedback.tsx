import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  ArrowLeft,
  RefreshCw,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Download,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail } from "@/config/auth";

// answer_feedback is a pending-apply table (see
// docs/db/20260903_answer_feedback.sql) not yet present in the generated
// Database type (src/integrations/supabase/types.ts is machine-generated
// from the live schema -- regenerating it after the owner applies that SQL
// is a follow-up, not part of this change). Same untyped-view pattern as
// AdminHealth.tsx for perf_events/probe_state.
const db = supabase as unknown as { from: (table: string) => any };

interface FeedbackRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  message_id: string | null;
  rating: "up" | "down" | null;
  citation_issue: string | null;
  comment: string | null;
  mode: string | null;
  created_at: string;
  reviewed: boolean;
  reviewed_at: string | null;
  review_note: string | null;
}

interface Draft {
  reviewed: boolean;
  note: string;
}

const MODE_LABELS: Record<string, string> = {
  primary: "الرئيسي",
  standard: "الاستشاري",
  analysis: "التحليلي",
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function shortId(id: string | null): string {
  if (!id) return "—";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/**
 * Maps one answer_feedback row into the evals/golden/ candidate shape (see
 * scripts/golden-set.mjs and evals/golden/README.md for the canonical
 * schema). answer_feedback does NOT store the original question or answer
 * text -- only feedback ON an answer -- so question_ar / expected_sections /
 * code_family can never be reliably filled in from this table alone. Every
 * exported row therefore lands as source "generated", status "candidate",
 * with a placeholder question_ar and a `notes` field carrying every pointer
 * (conversation_id, message_id, rating, mode, citation_issue, comment,
 * review_note) a human reviewer needs to go find the real conversation and
 * complete the entry before it is fit to promote to "validated" (via
 * `node scripts/golden-set.mjs --import`, using the normal review-sheet CSV
 * flow -- this export is a separate manual-triage starting point, not
 * auto-merged into evals/golden/candidates-20260903.json).
 */
function feedbackRowToCandidate(row: FeedbackRow) {
  const notesParts = [
    `feedback_id=${row.id}`,
    `rating=${row.rating ?? "none"}`,
    `mode=${row.mode ?? "unknown"}`,
    `conversation_id=${row.conversation_id ?? "unknown"}`,
    `message_id=${row.message_id ?? "unknown"}`,
    `created_at=${row.created_at}`,
  ];
  if (row.citation_issue) notesParts.push(`citation_issue="${row.citation_issue}"`);
  if (row.comment) notesParts.push(`comment="${row.comment}"`);
  if (row.review_note) notesParts.push(`review_note="${row.review_note}"`);

  return {
    id: `feedback-${row.id}`,
    question_ar:
      row.citation_issue?.trim() ||
      row.comment?.trim() ||
      "[يتطلب استكمال نص السؤال يدوياً من المحادثة قبل الاستخدام]",
    category: `user-feedback-${row.mode ?? "unknown"}`,
    code_family: "unknown",
    expected_sections: [] as string[],
    source: "generated" as const,
    status: "candidate" as const,
    notes: notesParts.join(" | "),
  };
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminFeedback() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const isAdmin = isAdminEmail(user?.email);

  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
    if (!authLoading && user && !isAdmin) navigate("/");
  }, [user, authLoading, isAdmin, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await db
        .from("answer_feedback")
        .select("id, user_id, conversation_id, message_id, rating, citation_issue, comment, mode, created_at, reviewed, reviewed_at, review_note")
        .order("created_at", { ascending: false })
        .limit(500);
      if (fetchError) throw new Error(fetchError.message);
      setRows((data ?? []) as FeedbackRow[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "تعذّر تحميل الملاحظات";
      setError(
        message.toLowerCase().includes("does not exist") || message.toLowerCase().includes("schema cache")
          ? "الجدول غير موجود بعد — طبّق docs/db/20260903_answer_feedback.sql."
          : message,
      );
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, fetchData]);

  if (authLoading || (!loadedOnce && loading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const visibleRows = showAll ? rows : rows.filter((r) => !r.reviewed);
  const unreviewedCount = rows.filter((r) => !r.reviewed).length;
  const downCount = rows.filter((r) => r.rating === "down").length;

  function getDraft(row: FeedbackRow): Draft {
    return drafts[row.id] ?? { reviewed: row.reviewed, note: row.review_note ?? "" };
  }

  function setDraft(id: string, draft: Draft) {
    setDrafts((prev) => ({ ...prev, [id]: draft }));
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(visibleRows.map((r) => r.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function saveReview(row: FeedbackRow) {
    const draft = getDraft(row);
    setSavingId(row.id);
    try {
      const reviewedAt = draft.reviewed ? new Date().toISOString() : null;
      const note = draft.note.trim() ? draft.note.trim() : null;
      const { error: updateError } = await db
        .from("answer_feedback")
        .update({ reviewed: draft.reviewed, reviewed_at: reviewedAt, review_note: note })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, reviewed: draft.reviewed, reviewed_at: reviewedAt, review_note: note } : r)),
      );
      toast({ title: "تم حفظ المراجعة" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "تعذّر حفظ المراجعة";
      toast({ title: "خطأ", description: message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  function exportSelected() {
    const chosen = rows.filter((r) => selected.has(r.id));
    if (chosen.length === 0) return;
    const candidates = chosen.map(feedbackRowToCandidate);
    downloadJson(`answer-feedback-export-${new Date().toISOString().slice(0, 10)}.json`, candidates);
    toast({ title: `تم تصدير ${chosen.length} عنصراً`, description: "راجع الحقول يدوياً قبل دمجها في المجموعة الذهبية." });
    clearSelection();
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="fixed inset-0 blueprint-grid opacity-20 pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card/60 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gradient">ملاحظات الإجابات</h1>
            <p className="text-xs text-muted-foreground">طابور المراجعة — التقييمات ومشاكل الاستشهاد</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 me-1" />
            لوحة التحكم
          </Button>
        </div>
      </header>

      <div className="relative z-10 p-6 pb-24 md:pb-6 max-w-5xl mx-auto space-y-6">
        {error && (
          <Card className="bg-destructive/5 border-destructive/40">
            <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* ===== SUMMARY ===== */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-card/80 backdrop-blur-xl border-border/50">
            <CardContent className="p-5">
              <p className="text-3xl font-bold">{rows.length}</p>
              <p className="text-sm text-muted-foreground mt-1">إجمالي الملاحظات</p>
            </CardContent>
          </Card>
          <Card className={`bg-card/80 backdrop-blur-xl border-border/50 ${unreviewedCount > 0 ? "border-primary/40" : ""}`}>
            <CardContent className="p-5">
              <p className="text-3xl font-bold text-primary">{unreviewedCount}</p>
              <p className="text-sm text-muted-foreground mt-1">بانتظار المراجعة</p>
            </CardContent>
          </Card>
          <Card className="bg-card/80 backdrop-blur-xl border-border/50">
            <CardContent className="p-5">
              <p className={`text-3xl font-bold ${downCount > 0 ? "text-destructive" : ""}`}>{downCount}</p>
              <p className="text-sm text-muted-foreground mt-1">تقييمات سلبية</p>
            </CardContent>
          </Card>
        </div>

        {/* ===== TOOLBAR ===== */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant={showAll ? "ghost" : "secondary"} size="sm" onClick={() => setShowAll(false)}>
                غير المراجَعة ({unreviewedCount})
              </Button>
              <Button variant={showAll ? "secondary" : "ghost"} size="sm" onClick={() => setShowAll(true)}>
                الكل ({rows.length})
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={selectAllVisible} disabled={visibleRows.length === 0}>
                تحديد الكل ({visibleRows.length})
              </Button>
              {selected.size > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  إلغاء التحديد
                </Button>
              )}
              <Button size="sm" onClick={exportSelected} disabled={selected.size === 0}>
                <Download className="w-4 h-4 me-1" />
                تصدير للمجموعة الذهبية ({selected.size})
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ===== QUEUE ===== */}
        {visibleRows.length === 0 ? (
          <Card className="bg-card/80 backdrop-blur-xl border-border/50">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {showAll ? "لا توجد ملاحظات بعد." : "لا توجد ملاحظات بانتظار المراجعة."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleRows.map((row) => {
              const draft = getDraft(row);
              return (
                <Card key={row.id} className="bg-card/80 backdrop-blur-xl border-border/50">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={(checked) => toggleSelect(row.id, checked === true)}
                        />
                        {row.rating === "up" && (
                          <Badge variant="outline" className="border-primary/30 text-primary gap-1">
                            <ThumbsUp className="w-3 h-3" /> إيجابي
                          </Badge>
                        )}
                        {row.rating === "down" && (
                          <Badge variant="outline" className="border-destructive/30 text-destructive gap-1">
                            <ThumbsDown className="w-3 h-3" /> سلبي
                          </Badge>
                        )}
                        {row.mode && (
                          <Badge variant="outline" className="text-muted-foreground">
                            {MODE_LABELS[row.mode] ?? row.mode}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground font-mono">{fmtTime(row.created_at)}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          محادثة: {shortId(row.conversation_id)} · رسالة: {shortId(row.message_id)}
                        </span>
                      </div>
                      {row.reviewed && (
                        <Badge variant="outline" className="border-primary/30 text-primary">
                          تمت المراجعة{row.reviewed_at ? ` · ${fmtTime(row.reviewed_at)}` : ""}
                        </Badge>
                      )}
                    </div>

                    {row.citation_issue && (
                      <div className="text-sm">
                        <span className="text-xs text-muted-foreground">مشكلة الاستشهاد: </span>
                        {row.citation_issue}
                      </div>
                    )}
                    {row.comment && (
                      <div className="text-sm">
                        <span className="text-xs text-muted-foreground">تعليق: </span>
                        {row.comment}
                      </div>
                    )}

                    <div className="pt-2 border-t border-border/20 space-y-2">
                      <Textarea
                        placeholder="ملاحظة المراجعة..."
                        value={draft.note}
                        onChange={(e) => setDraft(row.id, { ...draft, note: e.target.value })}
                        className="text-sm min-h-[60px]"
                        rows={2}
                      />
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Switch
                            checked={draft.reviewed}
                            onCheckedChange={(checked) => setDraft(row.id, { ...draft, reviewed: checked })}
                          />
                          تمت المراجعة
                        </label>
                        <Button size="sm" onClick={() => saveReview(row)} disabled={savingId === row.id}>
                          {savingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
