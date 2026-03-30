import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Mail, Clock } from "lucide-react";

export default function Contact() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";

  const [formState, setFormState] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Open mail client as fallback (no backend email endpoint yet)
    const body = encodeURIComponent(
      `Name: ${formState.name}\nEmail: ${formState.email}\n\n${formState.message}`
    );
    window.open(
      `mailto:hello@consultx.app?subject=${encodeURIComponent(formState.subject)}&body=${body}`,
      "_blank"
    );
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-4xl mx-auto px-4 md:px-6 py-12 md:py-20 w-full">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t("contactTitle")}</h1>
        <p className="text-sm text-muted-foreground mb-10">
          {isAr ? "نسعد بالإجابة على استفساراتك الهندسية والتقنية" : "We're happy to answer your engineering and technical inquiries"}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
          {/* Left: Contact Form */}
          <div>
            {submitted ? (
              <div
                className="p-6 rounded-2xl text-center"
                style={{
                  background: "rgba(0,212,255,0.04)",
                  border: "1px solid rgba(0,212,255,0.2)",
                }}
              >
                <p className="text-foreground font-semibold text-lg mb-2">
                  {isAr ? "تم إرسال رسالتك ✓" : "Message sent ✓"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isAr
                    ? "سيفتح تطبيق البريد الإلكتروني لديك. نرد في غضون 24 ساعة."
                    : "Your email client will open. We respond within 24 hours."}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground">{t("contactFormName")}</label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-transparent border border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder={isAr ? "اسمك الكامل" : "Your full name"}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground">{t("contactFormEmail")}</label>
                  <input
                    type="email"
                    required
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-transparent border border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder={isAr ? "بريدك الإلكتروني" : "your@email.com"}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground">{t("contactFormSubject")}</label>
                  <input
                    type="text"
                    required
                    value={formState.subject}
                    onChange={(e) => setFormState({ ...formState, subject: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-transparent border border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder={isAr ? "موضوع الرسالة" : "Message subject"}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-muted-foreground">{t("contactFormMessage")}</label>
                  <textarea
                    required
                    rows={5}
                    value={formState.message}
                    onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-transparent border border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors resize-none"
                    placeholder={isAr ? "اكتب رسالتك هنا..." : "Write your message here..."}
                  />
                </div>

                <Button type="submit" variant="hero" className="w-full mt-1">
                  {t("contactFormSubmit")}
                </Button>
              </form>
            )}
          </div>

          {/* Right: Contact Info */}
          <div className="flex flex-col gap-6">
            <div
              className="p-5 rounded-2xl flex items-start gap-4"
              style={{
                background: "rgba(0,212,255,0.03)",
                border: "1px solid rgba(0,212,255,0.12)",
              }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: "rgba(0,212,255,0.08)",
                  border: "1px solid rgba(0,212,255,0.2)",
                }}
              >
                <Mail className="w-4 h-4 text-primary" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">
                  {t("contactEmailLabel")}
                </p>
                <a
                  href="mailto:hello@consultx.app"
                  className="text-sm text-primary hover:underline"
                >
                  hello@consultx.app
                </a>
              </div>
            </div>

            <div
              className="p-5 rounded-2xl flex items-start gap-4"
              style={{
                background: "rgba(255,140,0,0.03)",
                border: "1px solid rgba(255,140,0,0.12)",
              }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: "rgba(255,140,0,0.08)",
                  border: "1px solid rgba(255,140,0,0.2)",
                }}
              >
                <Clock className="w-4 h-4 text-orange-400" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">
                  {isAr ? "وقت الاستجابة" : "Response Time"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("contactResponseTime")}
                </p>
              </div>
            </div>

            <div
              className="p-5 rounded-2xl text-sm text-muted-foreground leading-relaxed"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <p className="font-semibold text-foreground mb-2">
                {isAr ? "سؤال هندسي؟" : "Engineering question?"}
              </p>
              <p>
                {isAr
                  ? "للأسئلة الهندسية التقنية، استخدم مباشرة واجهة الاستشارة في التطبيق للحصول على إجابة موثقة فورية."
                  : "For technical engineering questions, use the consultation interface in the app directly for an immediate cited answer."}
              </p>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
