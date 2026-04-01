import { useNavigate } from "react-router-dom";
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
import CosmicBackground from "@/components/CosmicBackground";
import { useEntitlement } from "@/hooks/useEntitlement";

const Index = () => {
  const navigate = useNavigate();
  const { user } = useEntitlement();

  const handleStartChat = () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    navigate("/workspace");
  };

  return (
    <main className="min-h-screen bg-background relative">
      <CosmicBackground />
      <div className="relative z-10">
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
    </main>
  );
};

export default Index;
