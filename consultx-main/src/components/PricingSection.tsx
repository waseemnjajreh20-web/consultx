import { useState, useEffect } from "react";
import { CheckCircle, Sparkles, Users, Building2, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface Plan {
  id: string;
  name_ar: string;
  name_en: string;
  price_amount: number;
  type: string;
  target: string;
  duration_days: number;
}

const FEATURES: Record<string, string[]> = {
  individual: [
    "featureSBC",
    "featureNFPA",
    "featurePlanAnalysis",
    "featureVisionAI",
    "featureUnlimitedChat",
  ],
  corporate: [
    "featureSBC",
    "featureNFPA",
    "featurePlanAnalysis",
    "featureVisionAI",
    "featureUnlimitedChat",
    "featurePriority",
  ],
  contractor: [
    "featureSBC",
    "featureNFPA",
    "featurePlanAnalysis",
    "featureVisionAI",
    "featureUnlimitedChat",
    "featurePriority",
    "featureDedicatedSupport",
  ],
};

const TAB_ICONS = {
  individual: <Users className="w-4 h-4" />,
  corporate: <Building2 className="w-4 h-4" />,
  contractor: <HardHat className="w-4 h-4" />,
};

const PricingSection = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activeTab, setActiveTab] = useState("individual");

  useEffect(() => {
    const fetchPlans = async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("price_amount", { ascending: true });
      if (data) setPlans(data);
    };
    fetchPlans();
  }, []);

  const filteredPlans = plans.filter((p) => p.target === activeTab);

  const getPriceLabel = (type: string) => {
    if (type === "weekly") return t("sarWeek");
    if (type === "yearly") return t("sarYear");
    return t("sarMonth");
  };

  const isPopular = (plan: Plan) => plan.type === "monthly" && plan.target === "individual";

  const getSavingPercent = (plan: Plan) => {
    if (plan.type !== "yearly" || plan.target !== "individual") return null;
    const monthly = plans.find((p) => p.target === "individual" && p.type === "monthly");
    if (!monthly) return null;
    const yearlyIfMonthly = monthly.price_amount * 12;
    const saving = Math.round(((yearlyIfMonthly - plan.price_amount) / yearlyIfMonthly) * 100);
    return saving > 0 ? saving : null;
  };

  return (
    <section id="pricing-section" className="w-full max-w-5xl mx-auto px-4">
      {/* Section Title */}
      <div className="text-center mb-10 animate-fade-up">
        <h2 className="text-3xl md:text-4xl font-bold text-gradient mb-3">
          {t("pricingSectionTitle")}
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          {t("pricingSectionSubtitle")}
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full max-w-md mx-auto mb-8 bg-secondary/50 backdrop-blur-sm border border-border/50">
          {(["individual", "corporate", "contractor"] as const).map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="flex-1 gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-glow transition-all duration-300"
            >
              {TAB_ICONS[tab]}
              {t(`tab_${tab}` as any)}
            </TabsTrigger>
          ))}
        </TabsList>

        {(["individual", "corporate", "contractor"] as const).map((tab) => (
          <TabsContent key={tab} value={tab}>
            <div className={`grid gap-6 ${
              tab === "individual" ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 max-w-md mx-auto"
            }`}>
              {filteredPlans.map((plan, i) => {
                const popular = isPopular(plan);
                const saving = getSavingPercent(plan);

                return (
                  <div
                    key={plan.id}
                    className={`relative group rounded-2xl border p-6 transition-all duration-500 animate-fade-up hover:scale-105 ${
                      popular
                        ? "border-glow bg-card/90 backdrop-blur-xl"
                        : "border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/40"
                    }`}
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    {/* Popular Badge */}
                    {popular && (
                      <Badge className="absolute -top-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 bg-primary text-primary-foreground animate-pulse-glow px-4">
                        <Sparkles className="w-3 h-3 me-1" />
                        {t("mostPopular")}
                      </Badge>
                    )}

                    {/* Saving Badge */}
                    {saving && (
                      <Badge variant="secondary" className="absolute -top-3 end-4 bg-accent/20 text-accent border-accent/30">
                        {t("savePercent").replace("{percent}", String(saving))}
                      </Badge>
                    )}

                    {/* Plan Name */}
                    <h3 className="text-xl font-bold text-foreground mt-2 mb-4">
                      {language === "ar" ? plan.name_ar : plan.name_en}
                    </h3>

                    {/* Price */}
                    <div className="mb-6">
                      <span className="text-4xl font-bold text-primary">
                        {(plan.price_amount / 100).toFixed(0)}
                      </span>
                      <span className="text-muted-foreground ms-1 text-sm">
                        {getPriceLabel(plan.type)}
                      </span>
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 mb-6">
                      {FEATURES[tab]?.map((fKey) => (
                        <li key={fKey} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                          <span>{t(fKey as any)}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <Button
                      variant={popular ? "hero" : "heroOutline"}
                      className="w-full"
                      onClick={() => navigate(`/subscribe?plan=${plan.id}`)}
                    >
                      {t("choosePlan")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
};

export default PricingSection;
