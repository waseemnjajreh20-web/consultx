/**
 * AnswerFeedback.tsx — per-answer 👍/👎 + "استشهاد خاطئ" (wrong citation)
 * report, gated behind ANSWER_FEEDBACK_UI (src/lib/featureFlags.ts).
 *
 * The target table (public.answer_feedback) does not exist yet — another
 * agent owns its SQL in this wave. Every write here is therefore
 * deliberately FAIL-SOFT: a missing table / RLS rejection / network error
 * shows a small Arabic toast and otherwise changes nothing — it must never
 * block or disrupt the chat. The optimistic UI (selected thumb, "sent"
 * confirmation) does not roll back on failure; re-showing an error state
 * for a best-effort feedback signal would be more disruptive than useful.
 */
import { useState } from "react";
import { ThumbsUp, ThumbsDown, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Rating = "up" | "down";

interface AnswerFeedbackProps {
  conversationId: string | null;
  /** message.dbId ?? message.id — best-effort; the row may not exist server-side for a live (not-yet-reloaded) message. */
  messageId: string;
  mode: "primary" | "standard" | "analysis" | string;
  language?: string;
}

export default function AnswerFeedback({ conversationId, messageId, mode, language }: AnswerFeedbackProps) {
  const { toast } = useToast();
  const isAr = language !== "en";
  const [rating, setRating] = useState<Rating | null>(null);
  const [showCitationField, setShowCitationField] = useState(false);
  const [citationComment, setCitationComment] = useState("");
  const [citationSent, setCitationSent] = useState(false);
  const [sending, setSending] = useState(false);

  const notifyFailure = () => {
    toast({
      title: isAr ? "تعذّر إرسال الملاحظة" : "Could not send feedback",
      description: isAr
        ? "لم يتم حفظ ملاحظتك — لا تأثير على محادثتك."
        : "Your feedback wasn't saved — this has no effect on your conversation.",
      variant: "destructive",
    });
  };

  const send = async (payload: { rating: Rating | null; citation_issue: boolean; comment: string | null }) => {
    try {
      // building_profiles has generated types; answer_feedback does not exist
      // yet in src/integrations/supabase/types.ts — same `as any` escape hatch
      // already used in ChatInterface.tsx for sbc_documents queries.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("answer_feedback").insert({
        conversation_id: conversationId,
        message_id: messageId,
        mode,
        rating: payload.rating,
        citation_issue: payload.citation_issue,
        comment: payload.comment,
      });
      if (error) throw error;
    } catch {
      notifyFailure();
    }
  };

  const handleRate = (next: Rating) => {
    const cleared = rating === next;
    setRating(cleared ? null : next);
    void send({ rating: cleared ? null : next, citation_issue: false, comment: null });
  };

  const handleCitationSubmit = async () => {
    setSending(true);
    await send({ rating, citation_issue: true, comment: citationComment.trim() || null });
    setSending(false);
    setCitationSent(true);
    setShowCitationField(false);
  };

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="flex items-center flex-wrap gap-2 text-[11px] text-muted-foreground">
      <button
        type="button"
        onClick={() => handleRate("up")}
        aria-pressed={rating === "up"}
        title={isAr ? "إجابة مفيدة" : "Helpful answer"}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/40 hover:border-primary/50 hover:text-primary transition-colors"
        style={rating === "up" ? { color: "#00D4FF", borderColor: "rgba(0,212,255,0.4)" } : undefined}
      >
        <ThumbsUp className="w-3 h-3" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => handleRate("down")}
        aria-pressed={rating === "down"}
        title={isAr ? "إجابة غير مفيدة" : "Not helpful"}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/40 hover:border-destructive/50 hover:text-destructive transition-colors"
        style={rating === "down" ? { color: "#DC143C", borderColor: "rgba(220,20,60,0.4)" } : undefined}
      >
        <ThumbsDown className="w-3 h-3" strokeWidth={2} />
      </button>

      {citationSent ? (
        <span className="inline-flex items-center gap-1" style={{ color: "#00D4FF" }}>
          {isAr ? "شكراً — تم الإرسال" : "Thanks — sent"}
        </span>
      ) : showCitationField ? (
        <span className="inline-flex items-center gap-1.5">
          <input
            value={citationComment}
            onChange={(e) => setCitationComment(e.target.value)}
            placeholder={isAr ? "صف مشكلة الاستشهاد (اختياري)" : "Describe the citation issue (optional)"}
            className="text-[11px] bg-transparent border border-border/40 rounded-md px-2 py-1 w-40 sm:w-56 text-foreground focus:outline-none focus:border-primary/50"
          />
          <button
            type="button"
            onClick={handleCitationSubmit}
            disabled={sending}
            className="text-[11px] font-medium px-2 py-1 rounded-md border border-border/40 hover:border-primary/50 hover:text-primary disabled:opacity-50"
          >
            {isAr ? "إرسال" : "Send"}
          </button>
          <button
            type="button"
            onClick={() => { setShowCitationField(false); setCitationComment(""); }}
            className="text-[11px] px-1 text-muted-foreground hover:text-foreground"
          >
            {isAr ? "إلغاء" : "Cancel"}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setShowCitationField(true)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:text-amber-400 transition-colors"
        >
          <AlertTriangle className="w-3 h-3" strokeWidth={2} />
          {isAr ? "استشهاد خاطئ" : "Wrong citation"}
        </button>
      )}
    </div>
  );
}
