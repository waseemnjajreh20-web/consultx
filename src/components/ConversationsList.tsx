import { useState, useEffect } from "react";
import { MessageSquare, Trash2, Clock, FlaskConical, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversations, Conversation } from "@/hooks/useConversations";
import { useLanguage } from "@/hooks/useLanguage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConversationsListProps {
  onSelectConversation: (conversationId: string) => void;
  onClose: () => void;
}

export default function ConversationsList({ onSelectConversation, onClose }: ConversationsListProps) {
  const { listConversations, deleteConversation, loading } = useConversations();
  const { t, language } = useLanguage();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    const data = await listConversations();
    setConversations(data);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const success = await deleteConversation(deleteId);
    if (success) {
      setConversations((prev) => prev.filter((c) => c.id !== deleteId));
    }
    setDeleting(false);
    setDeleteId(null);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const locale = language === "ar" ? "ar-SA" : "en-US";

    if (diffDays === 0) {
      return `${t("today")} ${date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
    } else if (diffDays === 1) {
      return t("yesterday");
    } else if (diffDays < 7) {
      return t("daysAgo").replace("{days}", String(diffDays));
    } else {
      return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
    }
  };

  return (
    <div className="flex flex-col h-full bg-card/50 backdrop-blur-xl rounded-2xl border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          {t("conversationHistory")}
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t("close")}
        </Button>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t("noConversations")}</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="group flex items-center gap-3 p-3 rounded-xl hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => onSelectConversation(conv.id)}
              >
                {/* Mode Icon */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    conv.mode === "analysis"
                      ? "bg-red-600/10 text-red-600"
                      : conv.mode === "standard"
                      ? "bg-orange-500/10 text-orange-500"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {conv.mode === "analysis" ? (
                    <FlaskConical className="w-4 h-4" />
                  ) : conv.mode === "standard" ? (
                    <ClipboardList className="w-4 h-4" />
                  ) : (
                    <MessageSquare className="w-4 h-4" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{conv.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(conv.updated_at)}
                  </p>
                </div>

                {/* Delete Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteId(conv.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConversation")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirmation")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
