import { useState, lazy, Suspense, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import SiteHeader from "@/components/SiteHeader";
import HeroSection from "@/components/HeroSection";
import ProblemSolutionSection from "@/components/ProblemSolutionSection";
import HowItWorksSection from "@/components/HowItWorksSection";
import CoreBenefitsSection from "@/components/CoreBenefitsSection";
import ProductProofSection from "@/components/ProductProofSection";
import TrustStripSection from "@/components/TrustStripSection";
import PricingLanding from "@/components/PricingLanding";
import TestimonialsSection from "@/components/TestimonialsSection";
import FAQSection from "@/components/FAQSection";
import CTASection from "@/components/CTASection";
import SiteFooter from "@/components/SiteFooter";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import LoadingSpinner from "@/components/LoadingSpinner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import WelcomeEngineerModal from "@/components/WelcomeEngineerModal";
import CosmicBackground from "@/components/CosmicBackground";

const ChatInterface = lazy(() => import("@/components/ChatInterface"));

const SESSION_KEY_SHOW_CHAT = "consultx_showChat";

const Index = () => {
  const [showChat, setShowChat] = useState(() => sessionStorage.getItem(SESSION_KEY_SHOW_CHAT) === "1");
  const [welcomeTrialEnd, setWelcomeTrialEnd] = useState<string | null>(null);
  const { user, loading } = useAuth();
  const { subscription, loading: subLoading } = useSubscription();
  const { profile } = useProfile();
  const navigate = useNavigate();

  // Persist showChat state
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY_SHOW_CHAT, showChat ? "1" : "0");
  }, [showChat]);

  // Show welcome modal once for new corporate trial users
  useEffect(() => {
    if (profile?.trial_type === "launch_engineer_trial" && profile?.trial_end
      && !sessionStorage.getItem("welcome_shown_" + user?.id)) {
      sessionStorage.setItem("welcome_shown_" + user?.id, "1");
      setWelcomeTrialEnd(profile.trial_end);
    }
  }, [profile, user?.id]);

  // Auto-enter chat for users with an active paid subscription
  useEffect(() => {
    if (!loading && !subLoading && user && subscription?.active && !showChat) {
      setShowChat(true);
    }
  }, [loading, subLoading, user, subscription?.active]);

  const handleStartChat = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }

    // Active paid subscriber → chat
    if (subscription?.active) {
      setShowChat(true);
      return;
    }

    // Expired or cancelled → must re-subscribe
    if (subscription?.status === "expired" || subscription?.status === "cancelled") {
      navigate("/subscribe");
      return;
    }

    // New / free (Explorer) user — try auto-trial, then open chat regardless
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) {
        await supabase.functions.invoke("auto-trial", {
          headers: { Authorization: `Bearer ${s.access_token}` },
        });
      }
    } catch (e) {
      console.error("Auto-trial error:", e);
    }
    setShowChat(true);
  };

  // Don't show spinner when chat is already visible (prevents unmount on token refresh)
  if ((loading || (user && subLoading)) && !showChat) {
    return <LoadingSpinner />;
  }

  return (
    <AnimatePresence mode="wait">
      {showChat && user ? (
        <motion.div
          key="chat"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <Suspense fallback={<LoadingSpinner />}>
            <ChatInterface onBack={() => setShowChat(false)} />
          </Suspense>
        </motion.div>
      ) : (
        <motion.main
          key="landing"
          className="min-h-screen bg-background relative"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {/* Deep Space Cosmic Background */}
          <CosmicBackground />

          <div className="relative z-10">
            {/* Welcome modal for new corporate trial users */}
            {welcomeTrialEnd && (
              <WelcomeEngineerModal
                trialEnd={welcomeTrialEnd}
                onClose={() => setWelcomeTrialEnd(null)}
              />
            )}

            {/* 1. Site Header (navbar) */}
            <SiteHeader onStartChat={handleStartChat} isLoggedIn={!!user} />

            {/* 2. Hero */}
            <HeroSection onStartChat={handleStartChat} isLoggedIn={!!user} />

            {/* 3. Problem / Solution */}
            <ProblemSolutionSection />

            {/* 4. How It Works */}
            <div id="how-it-works">
              <HowItWorksSection />
            </div>

            {/* 5. Core Benefits */}
            <CoreBenefitsSection />

            {/* 6. Product Proof */}
            <ProductProofSection />

            {/* 7. Trust Strip */}
            <TrustStripSection />

            {/* 8. Pricing */}
            <PricingLanding />

            {/* 9. Testimonials */}
            <TestimonialsSection />

            {/* 10. FAQ */}
            <FAQSection />

            {/* 11. Final CTA */}
            <CTASection />

            {/* 12. Footer */}
            <SiteFooter />
          </div>
        </motion.main>
      )}
    </AnimatePresence>
  );
};

export default Index;
