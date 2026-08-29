import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import consultxIcon from "@/assets/consultx-platform-logo.png";

const SiteFooter = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <footer className="border-t border-border/30 bg-background/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-16">
        {/* Five-column grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
          {/* 1. Brand */}
          <div className="col-span-2 md:col-span-1">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 mb-3 hover:opacity-80 transition-opacity"
            >
              <img
                src={consultxIcon}
                alt="ConsultX"
                className="h-8 w-auto object-contain"
              />
              <span className="font-bold text-lg text-gradient">
                {t("appName")}
              </span>
            </button>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("footerSummary")}
            </p>
            {/* Social links */}
            <div className="flex items-center gap-3 mt-4">
              <a
                href="mailto:info@consultx.app"
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="Email"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </a>
            </div>
          </div>

          {/* 2. Product */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">
              {t("footerProduct")}
            </h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => navigate("/")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footerHome")}
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    document
                      .getElementById("how-it-works")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footerHowItWorks")}
                </button>
              </li>
              <li>
                <button
                  onClick={() =>
                    document
                      .getElementById("pricing")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footerPricing")}
                </button>
              </li>
            </ul>
          </div>

          {/* 3. References */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">
              {t("footerReferences")}
            </h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://sbc.gov.sa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footerSbc201")}
                </a>
              </li>
              <li>
                <a
                  href="https://sbc.gov.sa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footerSbc801")}
                </a>
              </li>
              <li>
                <a
                  href="https://998.gov.sa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footerNfpa")}
                </a>
              </li>
              <li>
                <span className="text-sm text-muted-foreground">
                  {t("footerCivilDefense")}
                </span>
              </li>
            </ul>
          </div>

          {/* 4. Account */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">
              {t("footerAccount")}
            </h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => navigate("/auth")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("signIn")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate("/account")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("myAccount")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate("/subscribe")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("subscribePage")}
                </button>
              </li>
            </ul>
          </div>

          {/* 5. Legal */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">
              {t("footerLegal")}
            </h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => navigate("/privacy")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footerPrivacy")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate("/terms")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footerTerms")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate("/refund")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footerRefund")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate("/contact")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footerContact")}
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Legal entity identity — Saudi B2B buyers verify this before paying */}
        <div className="pt-6 border-t border-border/20 space-y-1 text-center sm:text-start">
          <p className="text-xs font-medium text-muted-foreground">{t("footerLegalName")}</p>
          <p className="text-xs text-muted-foreground">
            {t("footerCr")} · {t("footerAddress")}
          </p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {t("footerPhone")}
          </p>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-border/20 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("footerCopyright")}</p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/privacy")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("footerPrivacy")}
            </button>
            <button
              onClick={() => navigate("/terms")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("footerTerms")}
            </button>
            <button
              onClick={() => navigate("/contact")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("footerContact")}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
