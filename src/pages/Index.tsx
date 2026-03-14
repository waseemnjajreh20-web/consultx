import { useState, lazy, Suspense, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import HeroSection from "@/components/HeroSection";
import HowItWorksSection from "@/components/HowItWorksSection";
import TechnologySection from "@/components/TechnologySection";
import StatsSection from "@/components/StatsSection";
import TechMarquee from "@/components/TechMarquee";
import PricingLanding from "@/components/PricingLanding";
import TestimonialsSection from "@/components/TestimonialsSection";
import FAQSection from "@/components/FAQSection";
import CTASection from "@/components/CTASection";
import LandingFooter from "@/components/LandingFooter";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import LoadingSpinner from "@/components/LoadingSpinner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import WelcomeEngineerModal from "@/components/WelcomeEngineerModal";

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

  const handleStartChat = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!subscription?.active) {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s) {
          const { data } = await supabase.functions.invoke("auto-trial", {
            headers: { Authorization: `Bearer ${s.access_token}` },
          });
          if (data?.result === "created") {
            setShowChat(true);
            return;
          }
          if (data?.result === "already_exists") {
            setShowChat(true);
            return;
          }
        }
      } catch (e) {
        console.error("Auto-trial error:", e);
      }
      navigate("/subscribe");
      return;
    }
    setShowChat(true);
  };

  if (loading || (user && subLoading)) {
    return <LoadingSpinner />;
  }

  if (showChat && user) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <ChatInterface onBack={() => setShowChat(false)} />
      </Suspense>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Welcome modal for new corporate trial users */}
      {welcomeTrialEnd && (
        <WelcomeEngineerModal
          trialEnd={welcomeTrialEnd}
          onClose={() => setWelcomeTrialEnd(null)}
        />
      )}

      {/* 1. Navbar + Brand Marquee + Hero */}
      <HeroSection onStartChat={handleStartChat} isLoggedIn={!!user} />

      {/* 2. How It Works */}
      <div id="how-it-works">
        <HowItWorksSection />
      </div>

      {/* 3. Technology / Agent Architecture */}
      <TechnologySection />

      {/* 4. Stats/Numbers */}
      <StatsSection />

      {/* 5. Pricing */}
      <PricingLanding />

      {/* 6. Tech Standards Marquee (reverse direction) */}
      <TechMarquee />

      {/* 7. Testimonials */}
      <TestimonialsSection />

      {/* 8. FAQ */}
      <FAQSection />

      {/* 9. Final CTA */}
      <CTASection />

      {/* 10. Footer */}
      <LandingFooter />
    </main>
  );
};

export default Index;
