import { useState, useEffect } from "react";
import { useConversations, Conversation } from "@/hooks/useConversations";
import { useLanguage } from "@/hooks/useLanguage";
import { useNavigate } from "react-router-dom";
import {
  Plus, MessageSquare, ClipboardList, FlaskConical,
  UserCircle, ArrowLeft, ArrowRight, Lock, X, Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import consultxIcon from "@/assets/consultx-platform-logo.png";
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

type ChatMode = "primary" | "standard" | "analysis";

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chatMode: ChatMode;
  onModeSwitch: (mode: ChatMode) => void;
  isFreePlan: boolean;
  trialActive: boolean;
  modeLockTarget: "standard" | "analysis" | null;
  onClearModeLock: () => void;
  conversationId: string | null;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onBack: () => void;
  displayName: string;
  language: string;
  dir: "ltr" | "rtl";
  isMobile: boolean;
}

const MODE_CONFIG = {
  primary: {
    color: "#00D4FF",
    bgColor: "rgba(0,212,255,0.1)",
    borderColor: "rgba(0,212,255,0.3)",
    Icon: MessageSquare,
  },
  standard: {
    color: "#FF8C00",
    bgColor: "rgba(255,140,0,0.1)",
    borderColor: "rgba(255,140,0,0.3)",
    Icon: ClipboardList,
  },
  analysis: {
    color: "#DC143C",
    bgColor: "rgba(220,20,60,0.1)",
    borderColor: "rgba(220,20,60,0.3)",
    Icon: FlaskConical,
  },
} as const;

export default function ChatSidebar({
  isOpen,
  onClose,
  chatMode,
  onModeSwitch,
  isFreePlan,
  trialActive,
  modeLockTarget,
  onClearModeLock,
  conversationId,
  onNewConversation,
  onSelectConversation,
  onBack,
  displayName,
  language,
  dir,
  isMobile,
}: ChatSidebarProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { listConversations, deleteConversation, loading } = useConversations();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isRtl = dir === "rtl";

  // Load on mount
  useEffect(() => {
    loadConvs();
  }, []);

  // Reload when conversation changes (new conv created or loaded)
  useEffect(() => {
    const timer = setTimeout(loadConvs, 1200);
    return () => clearTimeout(timer);
  }, [conversationId]);

  const loadConvs = async () => {
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
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) return language === "ar" ? "اليوم" : "Today";
    if (diffDays === 1) return language === "ar" ? "أمس" : "Yesterday";
    if (diffDays < 7) {
      return language === "ar" ? `منذ ${diffDays} أيام` : `${diffDays}d ago`;
    }
    return date.toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Logo header ────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-4 shrink-0 border-b border-border/20">
        <img src={consultxIcon} alt="ConsultX" className="w-8 h-8 object-contain" />
        <span className="text-base font-bold text-gradient">ConsultX</span>
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="ms-auto h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* ── New Chat ──────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-sm text-muted-foreground hover:text-foreground border-border/30 hover:border-primary/40 hover:bg-primary/5 transition-all"
          onClick={() => {
            onNewConversation();
            if (isMobile) onClose();
          }}
        >
          <Plus className="w-4 h-4" />
          {language === "ar" ? "محادثة جديدة" : "New Chat"}
        </Button>
      </div>

      {/* ── Mode Selector ────────────────────────── */}
      <div className="px-3 pb-3 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 px-1 mb-2">
          {language === "ar" ? "الوضع" : "Mode"}
        </p>
        <div className="space-y-0.5 relative">
          {(["primary", "standard", "analysis"] as ChatMode[]).map((mode) => {
            const cfg = MODE_CONFIG[mode];
            const isActive = chatMode === mode;
            const isLocked =
              isFreePlan &&
              !trialActive &&
              (mode === "standard" || mode === "analysis");
            const label =
              mode === "primary"
                ? t("primary")
                : mode === "standard"
                ? t("standard")
                : t("analysis");
            return (
              <button
                key={mode}
                onClick={() => {
                  onModeSwitch(mode);
                  if (isMobile && !isLocked) onClose();
                }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200",
                  isActive
                    ? "font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                )}
                style={
                  isActive
                    ? {
                        background: cfg.bgColor,
                        border: `1px solid ${cfg.borderColor}`,
                        color: cfg.color,
                      }
                    : { border: "1px solid transparent" }
                }
              >
                <cfg.Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-start">{label}</span>
                {isLocked && (
                  <Lock className="w-3 h-3 opacity-40 shrink-0" />
                )}
                {isActive && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: cfg.color }}
                  />
                )}
              </button>
            );
          })}

          {/* Mode lock popup */}
          {modeLockTarget && (
            <div
              className="absolute z-50 rounded-xl px-4 py-3 animate-fade-in"
              style={{
                background: "rgba(10, 15, 30, 0.98)",
                border: "1px solid rgba(0,212,255,0.25)",
                backdropFilter: "blur(16px)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                left: 0,
                right: 0,
                top: "calc(100% + 6px)",
              }}
            >
              <div className="flex items-start gap-2">
                <Lock
                  size={13}
                  strokeWidth={1.5}
                  className="shrink-0 mt-0.5 text-primary"
                />
                <div>
                  <p className="font-medium text-foreground mb-1.5 text-xs leading-snug">
                    {language === "en"
                      ? `${
                          modeLockTarget === "standard"
                            ? "Advisory Mode"
                            : "Analysis Mode"
                        } requires a paid plan`
                      : `${
                          modeLockTarget === "standard"
                            ? "الوضع الاستشاري"
                            : "الوضع التحليلي"
                        } يتطلب باقة مدفوعة`}
                  </p>
                  <button
                    onClick={() => {
                      onClearModeLock();
                      navigate("/subscribe");
                    }}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {language === "en" ? "Upgrade →" : "← ترقية"}
                  </button>
                </div>
                <button
                  onClick={onClearModeLock}
                  className="ms-auto text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Divider ──────────────────────────────── */}
      <div className="border-t border-border/15 mx-3 shrink-0" />

      {/* ── Conversation History ─────────────────── */}
      <div className="flex flex-col flex-1 min-h-0 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 px-4 mb-2 shrink-0">
          {language === "ar" ? "المحادثات" : "History"}
        </p>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 px-4">
              <MessageSquare className="w-7 h-7 mx-auto mb-2 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground/40">
                {language === "ar"
                  ? "لا توجد محادثات بعد"
                  : "No conversations yet"}
              </p>
            </div>
          ) : (
            <div className="px-2 space-y-0.5">
              {conversations.map((conv) => {
                const isActive = conv.id === conversationId;
                const cfg =
                  conv.mode === "analysis"
                    ? MODE_CONFIG.analysis
                    : conv.mode === "standard"
                    ? MODE_CONFIG.standard
                    : MODE_CONFIG.primary;
                return (
                  <div
                    key={conv.id}
                    title={conv.title}
                    className={cn(
                      "group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150",
                      isActive
                        ? "bg-secondary/60 text-foreground"
                        : "text-muted-foreground/70 hover:bg-secondary/35 hover:text-foreground/90"
                    )}
                    onClick={() => {
                      onSelectConversation(conv.id);
                      if (isMobile) onClose();
                    }}
                  >
                    <cfg.Icon
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: cfg.color, opacity: isActive ? 1 : 0.6 }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate leading-tight">{conv.title}</p>
                      <p className="text-[10px] text-muted-foreground/40 truncate">
                        {formatDate(conv.updated_at)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 h-6 w-6 shrink-0 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(conv.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Footer: User + Back ─────────────────── */}
      <div className="border-t border-border/20 px-3 py-3 space-y-0.5 shrink-0">
        <button
          onClick={() => navigate("/account")}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
        >
          <UserCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 truncate text-start text-xs">{displayName}</span>
        </button>
        <button
          onClick={onBack}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
        >
          {isRtl ? (
            <ArrowRight className="w-4 h-4 shrink-0" />
          ) : (
            <ArrowLeft className="w-4 h-4 shrink-0" />
          )}
          <span className="text-xs">
            {language === "ar" ? "العودة للرئيسية" : "Back to Home"}
          </span>
        </button>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConversation")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmation")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  // ── Mobile: animated drawer ──────────────────
  if (isMobile) {
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.aside
              key="drawer"
              initial={{ x: isRtl ? "100%" : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: isRtl ? "100%" : "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className={cn(
                "fixed top-0 bottom-0 z-50 w-72 flex flex-col",
                isRtl
                  ? "right-0 border-s border-border/40"
                  : "left-0 border-e border-border/40"
              )}
              style={{
                background: "rgba(8, 12, 28, 0.98)",
                backdropFilter: "blur(24px)",
              }}
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    );
  }

  // ── Desktop: persistent sidebar ─────────────
  return (
    <aside
      className="hidden md:flex flex-col w-64 shrink-0 border-e border-border/20"
      style={{
        background: "rgba(8, 12, 28, 0.7)",
        backdropFilter: "blur(24px)",
      }}
    >
      {sidebarContent}
    </aside>
  );
}
