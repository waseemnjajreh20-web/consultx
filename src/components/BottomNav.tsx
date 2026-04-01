import { MessageSquare, Clock, Flame, UserCircle, FlaskConical, ClipboardList } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

type ChatMode = "primary" | "standard" | "analysis";

interface BottomNavProps {
  chatMode: ChatMode;
  onModeSwitch: (mode: ChatMode) => void;
  onToggleHistory: () => void;
  onScrollToInput: () => void;
  isFreePlan: boolean;
}

function getModeDotColor(mode: ChatMode) {
  if (mode === "primary") return "#00D4FF";
  if (mode === "standard") return "#FF8C00";
  return "#DC143C";
}

const BottomNav = ({ chatMode, onModeSwitch, onToggleHistory, onScrollToInput, isFreePlan }: BottomNavProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [modeSheetOpen, setModeSheetOpen] = useState(false);

  const tabs = [
    { id: "chat", icon: MessageSquare, action: onScrollToInput },
    { id: "history", icon: Clock, action: onToggleHistory },
    { id: "mode", icon: chatMode === "analysis" ? FlaskConical : chatMode === "standard" ? ClipboardList : Flame, action: () => setModeSheetOpen(true) },
    { id: "account", icon: UserCircle, action: () => navigate("/account") },
  ];

  const modes: { mode: ChatMode; icon: typeof MessageSquare; label: string; color: string; description: string }[] = [
    { mode: "primary", icon: MessageSquare, label: t("primary"), color: "#00D4FF", description: t("modeDesc_primary") },
    { mode: "standard", icon: ClipboardList, label: t("standard"), color: "#FF8C00", description: t("modeDesc_standard") },
    { mode: "analysis", icon: FlaskConical, label: t("analysis"), color: "#DC143C", description: t("modeDesc_analysis") },
  ];

  return (
    <>
      <motion.div
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-around bg-background/90 backdrop-blur-xl border-t border-border/30 px-2 py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isMode = tab.id === "mode";
            return (
              <button
                key={tab.id}
                onClick={tab.action}
                className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors hover:bg-secondary/50"
              >
                <div className="relative">
                  <Icon className="w-5 h-5 text-muted-foreground" />
                  {isMode && (
                    <span
                      className="absolute -top-0.5 -end-0.5 w-2 h-2 rounded-full"
                      style={{ background: getModeDotColor(chatMode) }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Mode picker bottom sheet */}
      <Sheet open={modeSheetOpen} onOpenChange={setModeSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl border-t border-border/50 bg-background/95 backdrop-blur-xl px-4 pb-8">
          <div className="w-12 h-1 bg-muted rounded-full mx-auto mt-3 mb-6" />
          <div className="space-y-2">
            {modes.map(({ mode, icon: Icon, label, color, description }) => {
              const isActive = chatMode === mode;
              const isLocked = isFreePlan && (mode === "standard" || mode === "analysis");
              return (
                <button
                  key={mode}
                  onClick={() => {
                    onModeSwitch(mode);
                    setModeSheetOpen(false);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all"
                  style={{
                    background: isActive ? `${color}15` : "transparent",
                    border: isActive ? `1px solid ${color}40` : "1px solid transparent",
                  }}
                >
                  <Icon className="w-5 h-5 shrink-0" style={{ color }} />
                  <div className="flex flex-col items-start text-start min-w-0">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">{description}</span>
                  </div>
                  {isLocked && <span className="text-xs text-muted-foreground ms-auto">🔒</span>}
                  {isActive && !isLocked && (
                    <span className="w-2 h-2 rounded-full ms-auto shrink-0" style={{ background: color }} />
                  )}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default BottomNav;
