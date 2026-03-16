import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Mail, Lock, ArrowLeft, ArrowRight, Loader2, UserPlus, LogIn, Building2, Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { LanguageToggle } from "@/components/LanguageToggle";
import consultxIcon from "@/assets/consultx-icon.png";
import { isCorporateEmail, isPromoActive } from "@/lib/corporatePromo";

const CYAN = "hsl(195 85% 50%)";
const AMBER = "#FF8C00";

/* ── Minimal particles (10, very faint) ── */
const PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left: `${10 + Math.random() * 80}%`,
  top: `${10 + Math.random() * 80}%`,
  size: `${2 + Math.random() * 2.5}px`,
  duration: `${10 + Math.random() * 14}s`,
  delay: `${Math.random() * 8}s`,
  opacity: 0.06 + Math.random() * 0.1,
}));

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  const [shake, setShake] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signIn, signUp } = useAuth();
  const { t, dir, language } = useLanguage();
  const isAr = language === "ar";

  const showCorporateBadge = !isLogin && isCorporateEmail(email) && isPromoActive();
  const showPromoBanner = !isLogin && isPromoActive();

  const activateAutoTrial = async (accessToken: string) => {
    try {
      await supabase.functions.invoke("auto-trial", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (e) {
      console.error("Auto-trial error:", e);
    }
  };

  const activateCorporateTrial = async (accessToken: string) => {
    try {
      await supabase.functions.invoke("corporate-trial", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (e) {
      console.error("Corporate-trial error:", e);
    }
  };

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const validateForm = () => {
    const newErrors: typeof errors = {};
    const emailSchema = z.string().email(t("invalidEmail"));
    const passwordSchema = z.string().min(6, t("passwordMinLength"));

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) newErrors.email = emailResult.error.errors[0].message;

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) newErrors.password = passwordResult.error.errors[0].message;

    if (!isLogin && password !== confirmPassword) newErrors.confirmPassword = t("passwordMismatch");
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) triggerShake();
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          triggerShake();
          toast({
            title: t("loginError"),
            description: error.message.includes("Invalid login credentials") ? t("invalidCredentials") : error.message,
            variant: "destructive",
          });
        } else {
          const { data: { session: newSession } } = await supabase.auth.getSession();
          if (newSession) await activateAutoTrial(newSession.access_token);
          toast({ title: t("welcomeBack"), description: t("loginSuccess") });

          // Check for post-auth redirect (e.g. from pricing page)
          const params = new URLSearchParams(window.location.search);
          const redirect = params.get("redirect");
          const plan = params.get("plan");
          const billing = params.get("billing") || "annual";

          if (redirect === "subscribe" && plan && newSession) {
            try {
              const { data: checkoutData } = await supabase.functions.invoke("create-checkout", {
                body: { plan, billing_cycle: billing },
                headers: { Authorization: `Bearer ${newSession.access_token}` },
              });
              if (checkoutData?.checkout_url) {
                window.location.href = checkoutData.checkout_url;
                return;
              }
            } catch (_e) { /* fall through to default navigate */ }
          }
          navigate("/");
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          triggerShake();
          toast({
            title: error.message.includes("User already registered") ? t("accountExists") : t("unexpectedError"),
            description: error.message.includes("User already registered") ? t("emailRegistered") : error.message,
            variant: "destructive",
          });
        } else {
          const { data: { session: newSession } } = await supabase.auth.getSession();
          if (newSession) {
            // Session available = auto-confirmed or confirmed user
            await activateAutoTrial(newSession.access_token);
            await activateCorporateTrial(newSession.access_token);
            toast({ title: t("accountCreated"), description: t("signupSuccess") });

            // Check for post-auth redirect
            const params = new URLSearchParams(window.location.search);
            const redirect = params.get("redirect");
            const plan = params.get("plan");
            const billing = params.get("billing") || "annual";

            if (redirect === "subscribe" && plan) {
              try {
                const { data: checkoutData } = await supabase.functions.invoke("create-checkout", {
                  body: { plan, billing_cycle: billing },
                  headers: { Authorization: `Bearer ${newSession.access_token}` },
                });
                if (checkoutData?.checkout_url) {
                  window.location.href = checkoutData.checkout_url;
                  return;
                }
              } catch (_e) { /* fall through */ }
            }
            navigate("/");
          } else {
            // No session = email confirmation required
            toast({
              title: isAr ? "تم إنشاء الحساب بنجاح" : "Account created successfully",
              description: isAr
                ? "تم إرسال رابط التأكيد إلى بريدك الإلكتروني. يرجى فتح البريد والضغط على الرابط لتفعيل حسابك."
                : "A confirmation link has been sent to your email. Please open your email and click the link to activate your account.",
            });
          }
        }
      }
    } catch {
      triggerShake();
      toast({ title: t("unexpectedError"), description: t("unexpectedError"), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle = (field: string, hasError: boolean): React.CSSProperties => ({
    background: "rgba(17, 24, 39, 0.8)",
    border: `1px solid ${hasError ? "hsl(0 72% 51%)" : focusedField === field ? "rgba(0,212,255,0.5)" : "rgba(255,255,255,0.1)"}`,
    boxShadow: focusedField === field && !hasError ? "0 0 0 3px rgba(0,212,255,0.08)" : "none",
    color: "hsl(200 20% 90%)",
    borderRadius: "10px",
    width: "100%",
    padding: dir === "rtl" ? "12px 40px 12px 14px" : "12px 14px 12px 40px",
    fontSize: "16px", // 16px prevents iOS zoom on focus
    minHeight: "48px",
    outline: "none",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  });

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0a0f1a 0%, #111827 100%)" }}
    >
      {/* Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: p.left, top: p.top, width: p.size, height: p.size,
              background: CYAN, opacity: p.opacity,
              animation: `heroParticleFloat ${p.duration} ${p.delay} ease-in-out infinite alternate`,
            }}
          />
        ))}
        {/* Central radial glow */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "600px", height: "600px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,212,255,0.04) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Top bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm transition-all duration-200"
          style={{ color: "rgba(200,220,240,0.45)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(200,220,240,0.75)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(200,220,240,0.45)"; }}
        >
          {dir === "rtl" ? <ArrowRight size={16} strokeWidth={1.5} /> : <ArrowLeft size={16} strokeWidth={1.5} />}
          {t("backToHome")}
        </button>
        <LanguageToggle />
      </div>

      {/* Main card */}
      <div className="relative z-10 w-full max-w-[420px] px-4 md:px-0">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            {/* Glow blob — behind logo, not a circle clip */}
            <div
              className="absolute -inset-6 rounded-3xl pointer-events-none"
              style={{
                background: "radial-gradient(circle, rgba(0,212,255,0.15) 0%, transparent 70%)",
                animation: "avatarGlowBlue 5s ease-in-out infinite",
              }}
            />
            <img
              src={consultxIcon}
              alt="ConsultX"
              className="relative z-10"
              style={{ height: "60px", width: "auto", objectFit: "contain", borderRadius: 0, animation: "heroFloat 4s ease-in-out infinite" }}
            />
          </div>
        </div>

        {/* Glass card */}
        <div
          className="auth-card-mobile"
          style={{
            background: "rgba(17, 24, 39, 0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(0, 212, 255, 0.1)",
            borderRadius: "16px",
            padding: "24px 20px",
            boxShadow: "0 0 40px rgba(0,212,255,0.04)",
            animation: shake ? "authShake 0.45s ease" : "none",
          }}
        >
          {/* Title */}
          <div className="text-center mb-7">
            <h1
              className="text-2xl font-bold mb-2"
              style={{
                background: "linear-gradient(135deg, hsl(195 85% 50%), #ffffff)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {isLogin ? t("loginTitle") : t("signupTitle")}
            </h1>
            <p className="text-sm" style={{ color: "rgba(200,220,240,0.5)" }}>
              {isLogin ? t("loginSubtitle") : t("signupSubtitle")}
            </p>
          </div>

          {/* Promo banner (signup only) */}
          {showPromoBanner && (
            <div
              className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl mb-5 animate-fade-in"
              style={{
                background: "rgba(255,140,0,0.08)",
                border: "1px solid rgba(255,140,0,0.25)",
                color: AMBER,
              }}
            >
              <Building2 size={13} strokeWidth={1.5} className="shrink-0" />
              <span>{isAr ? "سجّل ببريدك المؤسسي واحصل على تجربة باقة مهندس مجاناً لمدة 3 أيام" : "Sign up with your corporate email and get a free 3-day Engineer plan trial"}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" dir={dir}>
            {/* Email */}
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium"
                style={{ color: "rgba(200,220,240,0.85)" }}
              >
                {t("email")}
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  strokeWidth={1.5}
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{
                    [dir === "rtl" ? "right" : "left"]: "12px",
                    color: focusedField === "email" ? CYAN : "rgba(200,220,240,0.35)",
                    transition: "color 0.2s ease",
                  }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="your@email.com"
                  dir="ltr"
                  style={inputStyle("email", !!errors.email)}
                />
              </div>
              {errors.email && <p className="text-xs" style={{ color: "hsl(0 72% 65%)" }}>{errors.email}</p>}
              {/* Corporate email badge */}
              {showCorporateBadge && (
                <div
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg animate-fade-in"
                  style={{
                    background: "rgba(0,212,255,0.08)",
                    border: "1px solid rgba(0,212,255,0.2)",
                    color: CYAN,
                    display: "inline-flex",
                  }}
                >
                  <Sparkles size={11} strokeWidth={1.5} />
                  {isAr ? "بريد مؤسسي — ستحصل على تجربة باقة مهندس مجاناً" : "Corporate email — You'll get a free Engineer plan trial"}
                </div>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" style={{ color: "rgba(200,220,240,0.85)" }}>
                {t("password")}
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  strokeWidth={1.5}
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{
                    [dir === "rtl" ? "right" : "left"]: "12px",
                    color: focusedField === "password" ? CYAN : "rgba(200,220,240,0.35)",
                    transition: "color 0.2s ease",
                  }}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••"
                  dir="ltr"
                  style={inputStyle("password", !!errors.password)}
                />
              </div>
              {errors.password && <p className="text-xs" style={{ color: "hsl(0 72% 65%)" }}>{errors.password}</p>}
            </div>

            {/* Confirm password (signup) */}
            {!isLogin && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: "rgba(200,220,240,0.85)" }}>
                  {t("confirmPassword")}
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    strokeWidth={1.5}
                    className="absolute top-1/2 -translate-y-1/2"
                    style={{
                      [dir === "rtl" ? "right" : "left"]: "12px",
                      color: focusedField === "confirm" ? CYAN : "rgba(200,220,240,0.35)",
                      transition: "color 0.2s ease",
                    }}
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={() => setFocusedField("confirm")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="••••••••"
                    dir="ltr"
                    style={inputStyle("confirm", !!errors.confirmPassword)}
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-xs" style={{ color: "hsl(0 72% 65%)" }}>{errors.confirmPassword}</p>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: CYAN,
                color: "hsl(220 40% 6%)",
                boxShadow: "0 0 25px rgba(0,212,255,0.3)",
              }}
              onMouseEnter={(e) => {
                if (!isLoading) (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 45px rgba(0,212,255,0.5)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 25px rgba(0,212,255,0.3)";
              }}
            >
              {isLoading ? (
                <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />
              ) : isLogin ? (
                <LogIn size={16} strokeWidth={1.5} />
              ) : (
                <UserPlus size={16} strokeWidth={1.5} />
              )}
              {isLogin ? t("signIn") : t("signUp")}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
            <span className="text-xs" style={{ color: "rgba(200,220,240,0.3)" }}>{isAr ? "أو" : "or"}</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* Google Sign-In */}
          <button
            type="button"
            onClick={async () => {
              setIsLoading(true);
              try {
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: {
                    redirectTo: window.location.origin,
                  },
                });
                if (error) throw error;
              } catch (e) {
                toast({ title: t("unexpectedError"), variant: "destructive" });
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-medium text-sm transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(200,220,240,0.85)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M47.532 24.552c0-1.636-.147-3.2-.418-4.698H24.48v9.01h13.02c-.572 2.99-2.26 5.52-4.8 7.22v6.01h7.76c4.54-4.18 7.072-10.34 7.072-17.542z" fill="#4285F4"/>
              <path d="M24.48 48c6.48 0 11.922-2.148 15.896-5.818l-7.76-6.01c-2.148 1.44-4.896 2.29-8.136 2.29-6.26 0-11.562-4.228-13.46-9.908H2.98v6.2C6.94 42.87 15.1 48 24.48 48z" fill="#34A853"/>
              <path d="M11.02 28.554A14.373 14.373 0 0 1 10.2 24c0-1.582.274-3.116.82-4.554v-6.2H2.98A23.942 23.942 0 0 0 .48 24c0 3.86.924 7.514 2.5 10.754l8.04-6.2z" fill="#FBBC05"/>
              <path d="M24.48 9.538c3.528 0 6.694 1.212 9.19 3.594l6.882-6.882C36.396 2.372 30.956 0 24.48 0 15.1 0 6.94 5.13 2.98 13.246l8.04 6.2c1.898-5.68 7.2-9.908 13.46-9.908z" fill="#EA4335"/>
            </svg>
            {isLogin
              ? (isAr ? "تسجيل الدخول بـ Google" : "Sign in with Google")
              : (isAr ? "إنشاء حساب بـ Google" : "Sign up with Google")}
          </button>

          {/* Toggle login/signup */}
          <div className="mt-5 text-center text-sm">
            <span style={{ color: "rgba(200,220,240,0.45)" }}>
              {isLogin ? t("noAccount") : t("hasAccount")}
            </span>{" "}
            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setErrors({}); setEmail(""); setPassword(""); setConfirmPassword(""); }}
              className="font-medium transition-all duration-200"
              style={{ color: CYAN }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "underline"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "none"; }}
            >
              {isLogin ? t("signUp") : t("signIn")}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-6" style={{ color: "rgba(200,220,240,0.2)" }}>
          {isAr ? "© ConsultX 2026 — مدعوم بمنظومة 12 وكيلاً ذكياً" : "© ConsultX 2026 — Powered by 12 AI Agents"}
        </p>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes authShake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
          90% { transform: translateX(3px); }
        }
        @keyframes logoRingRotate {
          from { filter: hue-rotate(0deg); }
          to { filter: hue-rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Auth;
