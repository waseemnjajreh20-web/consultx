import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import type { useOrganization } from "@/hooks/useOrganization";

type Message = ReturnType<typeof useOrganization>["messages"][number];

interface OrgMessagesPanelProps {
  messages: Message[];
  loading: boolean;
  currentUserId?: string;
  isOwnerOrAdmin: boolean;
  sendMessage: ReturnType<typeof useOrganization>["sendMessage"];
  deleteMessage: ReturnType<typeof useOrganization>["deleteMessage"];
}

function shortUid(uid: string) {
  return `…${uid.slice(-6)}`;
}

export default function OrgMessagesPanel({
  messages,
  loading,
  currentUserId,
  isOwnerOrAdmin,
  sendMessage,
  deleteMessage,
}: OrgMessagesPanelProps) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await sendMessage.mutateAsync({ body: trimmed });
      setBody("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMessage.mutateAsync({ messageId: id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    }
  };

  const sorted = [...messages].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div className="bg-card/60 rounded-xl border border-border/40 p-4 space-y-3">
      <p className="text-sm font-semibold flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        {ar ? "نقاشات المؤسسة" : "Team Discussion"}
        {!loading && messages.length > 0 && (
          <span className="text-xs text-muted-foreground font-normal ms-1">({messages.length})</span>
        )}
      </p>

      <div className="max-h-64 overflow-y-auto space-y-2 rounded-lg bg-background/30 border border-border/30 p-2">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted/20 rounded animate-pulse" />)}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {ar ? "لا توجد رسائل بعد — ابدأ النقاش" : "No messages yet — start the conversation"}
          </p>
        ) : (
          sorted.map((m) => {
            const isSelf = m.author_id === currentUserId;
            const canDel  = isSelf || isOwnerOrAdmin;
            return (
              <div
                key={m.id}
                className={`flex gap-2 group ${isSelf ? (ar ? "flex-row-reverse" : "flex-row-reverse") : ""}`}
              >
                <div className={`flex-1 min-w-0 rounded-lg px-3 py-2 text-sm ${isSelf ? "bg-primary/10 border border-primary/20" : "bg-muted/20 border border-border/30"}`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] text-muted-foreground font-mono">{shortUid(m.author_id)}</span>
                    {isSelf && (
                      <span className="text-[10px] text-primary font-semibold">{ar ? "(أنت)" : "(you)"}</span>
                    )}
                    {m.edited_at && (
                      <span className="text-[10px] text-muted-foreground/60">{ar ? "(محرَّر)" : "(edited)"}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground/50 ms-auto">
                      {new Date(m.created_at).toLocaleTimeString(ar ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {canDel && (
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-red-400 ms-1"
                        title={ar ? "حذف" : "Delete"}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="leading-relaxed break-words">{m.body}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={ar ? "اكتب رسالة…" : "Write a message…"}
          className="text-sm resize-none min-h-[40px] max-h-24"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          rows={1}
        />
        <Button
          size="icon"
          className="h-10 w-10 shrink-0 self-end"
          onClick={handleSend}
          disabled={!body.trim() || sendMessage.isPending}
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground/60">
        {ar ? "Enter للإرسال · Shift+Enter لسطر جديد" : "Enter to send · Shift+Enter for new line"}
      </p>
    </div>
  );
}
