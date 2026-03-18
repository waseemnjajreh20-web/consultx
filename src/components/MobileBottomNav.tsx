import { MessageSquarePlus, Clock, Brain, UserCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
/** Pages where the global nav should NOT appear */
const HIDDEN_PATHS = ["/payment-callback", "/"];

const MobileBottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  // Don't render on desktop
  if (!isMobile) return null;

  // Don't render on hidden pages (includes "/" — ChatInterface has its own BottomNav)
  if (HIDDEN_PATHS.includes(location.pathname)) return null;

  const handleNewChat = () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    // Set chat flag and navigate to index
    sessionStorage.setItem("consultx_showChat", "1");
    navigate("/");
  };

  const handleHistory = () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    sessionStorage.setItem("consultx_showChat", "1");
    navigate("/");
  };

  const handleMind = () => {
    navigate("/account");
  };

  const handleProfile = () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    navigate("/account");
  };

  const tabs = [
    {
      id: "new-chat",
      icon: MessageSquarePlus,
      label: t("startConsultation") || "Chat",
      action: handleNewChat,
      active: false,
    },
    {
      id: "history",
      icon: Clock,
      label: t("previousConversations") || "History",
      action: handleHistory,
      active: false,
    },
    {
      id: "mind",
      icon: Brain,
      label: "ConsultX Mind",
      action: handleMind,
      active: false,
    },
    {
      id: "profile",
      icon: UserCircle,
      label: t("myAccount") || "Profile",
      action: handleProfile,
      active: location.pathname === "/account",
    },
  ];

  return (
    <motion.nav
      initial={{ y: 80 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden mobile-bottom-nav"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around px-2 py-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <motion.button
              key={tab.id}
              onClick={tab.action}
              whileTap={{ scale: 0.85 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors"
              style={{
                color: tab.active
                  ? "#00D4FF"
                  : "hsl(200 15% 55%)",
              }}
            >
              <div className="relative">
                <Icon
                  className="w-5 h-5"
                  strokeWidth={1.6}
                  style={{
                    filter: tab.active
                      ? "drop-shadow(0 0 6px rgba(0,212,255,0.5))"
                      : "none",
                  }}
                />
                {/* Active indicator dot */}
                {tab.active && (
                  <motion.span
                    layoutId="nav-dot"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ background: "#00D4FF", boxShadow: "0 0 6px rgba(0,212,255,0.6)" }}
                  />
                )}
              </div>
              <span className="text-[10px] font-medium leading-tight truncate max-w-[56px]">
                {tab.id === "new-chat"
                  ? (user ? "Chat" : "Sign In")
                  : tab.id === "history"
                  ? "History"
                  : tab.id === "mind"
                  ? "Mind"
                  : "Profile"}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.nav>
  );
};

export default MobileBottomNav;
