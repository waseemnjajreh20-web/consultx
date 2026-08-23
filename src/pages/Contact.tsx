import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Mail, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type SubmitState = "idle" | "submitting" | "success" | "error";

// Local copy for this page only — Contact.tsx does not touch src/lib/translations.ts.
const CONTACT_LOCAL_COPY = {
  errorFallback: {
    ar: "تعذّر إرسال رسالتك. يرجى المحاولة مرة أخرى، أو راسلنا مباشرة على",
    en: "We couldn't send your message. Please try again, or email us directly at",
  },
  sending: {
    ar: "جارٍ الإرسال...",
    en: "Sending...",
  },
  successTitle: {
    ar: "تم إرسال رسالتك بنجاح",
    en: "Your message was sent successfully",
  },
  successBody: {
    ar: "وصلتنا رسالتك وسنرد عليك قريبًا على بريدك الإلكتروني.",
    en: "We've received your message and will get back to you by email soon.",
  },
  sendAnother: {
    ar: "إرسال رسالة أخرى",
    en: "Send another message",
  },
};

export default function Contact() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const copyLang = isAr ? "ar" : "en";

  const [formState, setFormState] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitState === "submitting") return; // guard against double-submit

    setSubmitState("submitting");
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke("send-contact-message", {
        body: formState,
      });

      if (error || !data?.success) {
        setErrorMessage(
          (data && typeof data.error === "string" && data.error) ||
            (error instanceof Error ? error.message : null),
        );
        setSubmitState("error");
        return;
      }

      setSubmitState("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : null);
      setSubmitState("error");
    }
  };

  const handleSendAnother = () => {
    setFormState({ name: "", email: "", subject: "", message: "" });
    setSubmitState("idle");
    setErrorMessage(null);
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
            {submitState === "success" ? (
              <div
                className="p-6 rounded-2xl text-center"
                style={{
                  background: "rgba(0,212,255,0.04)",
                  border: "1px solid rgba(0,212,255,0.2)",
                }}
                role="status"
              >
                <p className="text-foreground font-semibold text-lg mb-2">
                  {CONTACT_LOCAL_COPY.successTitle[copyLang]}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {CONTACT_LOCAL_COPY.successBody[copyLang]}
                </p>
                <Button type="button" variant="outline" onClick={handleSendAnother}>
                  {CONTACT_LOCAL_COPY.sendAnother[copyLang]}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                {submitState === "error" && (
                  <div
                    className="p-4 rounded-xl text-sm"
                    style={{
                      background: "rgba(239,68,68,0.06)",
                      border: "1px solid rgba(239,68,68,0.25)",
                    }}
                    role="alert"
                  >
                    {errorMessage && (
                      <p className="text-foreground mb-1">{errorMessage}</p>
                    )}
                    <p className="text-muted-foreground">
                      {CONTACT_LOCAL_COPY.errorFallback[copyLang]}{" "}
                      <a href="mailto:info@consultx.app" className="text-primary hover:underline">
                        info@consultx.app
                      </a>
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="contact-name" className="text-sm text-muted-foreground">
                    {t("contactFormName")}
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    maxLength={200}
                    disabled={submitState === "submitting"}
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-transparent border border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
                    placeholder={isAr ? "اسمك الكامل" : "Your full name"}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="contact-email" className="text-sm text-muted-foreground">
                    {t("contactFormEmail")}
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    maxLength={254}
                    disabled={submitState === "submitting"}
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-transparent border border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
                    placeholder={isAr ? "بريدك الإلكتروني" : "your@email.com"}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="contact-subject" className="text-sm text-muted-foreground">
                    {t("contactFormSubject")}
                  </label>
                  <input
                    id="contact-subject"
                    type="text"
                    required
                    maxLength={300}
                    disabled={submitState === "submitting"}
                    value={formState.subject}
                    onChange={(e) => setFormState({ ...formState, subject: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-transparent border border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
                    placeholder={isAr ? "موضوع الرسالة" : "Message subject"}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="contact-message" className="text-sm text-muted-foreground">
                    {t("contactFormMessage")}
                  </label>
                  <textarea
                    id="contact-message"
                    required
                    minLength={10}
                    maxLength={5000}
                    rows={5}
                    disabled={submitState === "submitting"}
                    value={formState.message}
                    onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl text-sm bg-transparent border border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors resize-none disabled:opacity-50"
                    placeholder={isAr ? "اكتب رسالتك هنا..." : "Write your message here..."}
                  />
                </div>

                <Button
                  type="submit"
                  variant="hero"
                  className="w-full mt-1"
                  disabled={submitState === "submitting"}
                  aria-busy={submitState === "submitting"}
                >
                  {submitState === "submitting"
                    ? CONTACT_LOCAL_COPY.sending[copyLang]
                    : t("contactFormSubmit")}
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
                  href="mailto:info@consultx.app"
                  className="text-sm text-primary hover:underline"
                >
                  info@consultx.app
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
