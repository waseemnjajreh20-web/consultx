import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, XCircle, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import {
  FOUNDING10_CAMPAIGN,
  FOUNDING10_CODE,
  isFounding10Active,
  getFounding10SubscribeUrl,
} from "@/lib/campaigns/founding10";
import { buildFounding10HtmlEmail, buildFounding10TextEmail } from "@/lib/emailTemplates/founding10";

const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];

export default function CampaignFounding10() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { language } = useLanguage();

  const [htmlPreview, setHtmlPreview] = useState("");
  const [textPreview, setTextPreview] = useState("");
  const [sending, setSending] = useState(false);
  const [previewMode, setPreviewMode] = useState<"test" | "fullPreview" | "fullSend">("test");
  const [confirmFullSend, setConfirmFullSend] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email.toLowerCase()) : false;

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
    if (!authLoading && user && !isAdmin) navigate("/");
  }, [user, authLoading, isAdmin, navigate]);

  useEffect(() => {
    setHtmlPreview(buildFounding10HtmlEmail());
    setTextPreview(buildFounding10TextEmail());
  }, []);

  const handleSendTest = async () => {
    setSending(true);
    setSendResult(null);
    setSendError(null);
    setPreviewMode("test");
    setConfirmFullSend(false);
    try {
      const { data, error } = await supabase.functions.invoke("send-founding10-campaign", {
        body: { mode: "testOnly", targetEmails: ADMIN_EMAILS },
      });
      if (error) throw new Error(error.message || "Function invocation failed");
      setSendResult(data);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const handlePreviewFullSend = async () => {
    setSending(true);
    setSendResult(null);
    setSendError(null);
    setPreviewMode("fullPreview");
    setConfirmFullSend(false);
    try {
      const { data, error } = await supabase.functions.invoke("send-founding10-campaign", {
        body: { mode: "send", dryRun: true, limit: 500 },
      });
      if (error) throw new Error(error.message || "Function invocation failed");
      setSendResult(data);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const handleFullSend = async () => {
    setSending(true);
    setSendResult(null);
    setSendError(null);
    setPreviewMode("fullSend");
    try {
      const { data, error } = await supabase.functions.invoke("send-founding10-campaign", {
        body: { mode: "send", limit: 500 },
      });
      if (error) throw new Error(error.message || "Function invocation failed");
      setSendResult(data);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (authLoading) return null;
  if (!isAdmin) return null;

  const isAr = language !== "en";
  const active = isFounding10Active();
  const ctaUrl = getFounding10SubscribeUrl("email", "reactivation");

  return (
    <div className="min-h-screen bg-background" dir={isAr ? "rtl" : "ltr"}>
      <div className="fixed inset-0 blueprint-grid opacity-20 pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card/60 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-gradient">{FOUNDING10_CAMPAIGN.title.en}</h1>
            <p className="text-xs text-muted-foreground">Campaign Code: {FOUNDING10_CODE}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="text-muted-foreground">
          <ArrowLeft className="w-4 h-4 me-1" />
          {isAr ? "العودة للوحة التحكم" : "Back to Admin"}
        </Button>
      </header>

      <div className="relative z-10 p-6 pb-24 md:pb-6 max-w-4xl mx-auto space-y-6">
        {/* Status */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {active ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <XCircle className="w-4 h-4 text-muted-foreground" />
              )}
              {isAr ? "حالة الحملة" : "Campaign Status"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={active ? "default" : "outline"}>
                {active
                  ? isAr ? "نشطة" : "Active"
                  : isAr ? "غير نشطة" : "Inactive"}
              </Badge>
              <span className="text-muted-foreground">
                {isAr
                  ? `VITE_FOUNDING10_LIVE = ${active ? '"true"' : 'غير "true"'}`
                  : `VITE_FOUNDING10_LIVE = ${active ? '"true"' : 'not "true"'}`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Campaign Details */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isAr ? "تفاصيل الحملة" : "Campaign Details"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">{isAr ? "الكود:" : "Code:"}</span> <span className="font-mono">{FOUNDING10_CODE}</span></div>
            <div><span className="text-muted-foreground">{isAr ? "العنوان (EN):" : "Title (EN):"}</span> {FOUNDING10_CAMPAIGN.title.en}</div>
            <div><span className="text-muted-foreground">{isAr ? "العنوان (AR):" : "Title (AR):"}</span> {FOUNDING10_CAMPAIGN.title.ar}</div>
            <div><span className="text-muted-foreground">{isAr ? "العرض (EN):" : "Offer (EN):"}</span> {FOUNDING10_CAMPAIGN.offer.en}</div>
            <div><span className="text-muted-foreground">{isAr ? "العرض (AR):" : "Offer (AR):"}</span> {FOUNDING10_CAMPAIGN.offer.ar}</div>
            <div><span className="text-muted-foreground">{isAr ? "المدة:" : "Duration:"}</span> {FOUNDING10_CAMPAIGN.durationDays} {isAr ? "أيام" : "days"}</div>
            <div><span className="text-muted-foreground">CTA URL:</span> <a href={ctaUrl} className="text-primary underline break-all" target="_blank" rel="noopener noreferrer">{ctaUrl}</a></div>
          </CardContent>
        </Card>

        {/* Eligibility Rules */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isAr ? "قواعد الأهلية" : "Eligibility Rules"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-400" /> {isAr ? "مستخدم مصادق عليه" : "Authenticated user"}</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-400" /> {isAr ? "ليس لديه اشتراك نشط" : "No active paid subscription"}</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-400" /> {isAr ? "ليس لديه اشتراك تجريبي نشط" : "No active trial"}</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-400" /> {isAr ? "ليس من مستخدمي المؤسسات (Enterprise)" : "Not an enterprise user"}</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-400" /> {isAr ? "ليس مشرفاً" : "Not an admin"}</div>
            <div className="flex items-center gap-2"><XCircle className="w-3.5 h-3.5 text-muted-foreground" /> {isAr ? "يمكن إغلاق البانر" : "Banner is dismissible"}</div>
          </CardContent>
        </Card>

        {/* Email Preview - HTML */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isAr ? "معاينة البريد الإلكتروني (HTML)" : "Email Preview (HTML)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-white rounded-lg overflow-hidden max-h-[600px] overflow-y-auto border border-border/30">
              <div dangerouslySetInnerHTML={{ __html: htmlPreview }} />
            </div>
          </CardContent>
        </Card>

        {/* Email Preview - Plain Text */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isAr ? "معاينة البريد الإلكتروني (نص)" : "Email Preview (Plain Text)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted/30 rounded-lg p-4 text-xs font-mono text-foreground/80 whitespace-pre-wrap border border-border/30 max-h-[400px] overflow-y-auto">
              {textPreview}
            </pre>
          </CardContent>
        </Card>

        {/* Send Section */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50 border-cyan-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-cyan-400">
              <Send className="w-4 h-4" />
              {isAr ? "إرسال البريد الإلكتروني للحملة" : "Send Campaign Email"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* Admin Test */}
            <div className="p-3 rounded-lg border border-cyan-500/20 space-y-2">
              <p className="font-semibold text-cyan-300">{isAr ? "اختبار المشرف" : "Admin Test"}</p>
              <p className="text-muted-foreground text-xs">
                {isAr
                  ? "أرسل بريد الحملة إلى حسابات المشرفين فقط لاختبار المظهر والتسليم."
                  : "Send the campaign email to admin accounts only to test rendering and delivery."}
              </p>
              <p className="text-xs text-muted-foreground/60 font-mono">{ADMIN_EMAILS.join(", ")}</p>
              <Button
                variant="outline"
                size="sm"
                className="border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
                onClick={handleSendTest}
                disabled={sending}
              >
                {sending && previewMode === "test" ? (
                  <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />{isAr ? "جارٍ الإرسال..." : "Sending..."}</>
                ) : (
                  <><Send className="w-3.5 h-3.5 me-1.5" />{isAr ? "إرسال اختبار" : "Send Admin Test"}</>
                )}
              </Button>
            </div>

            {/* Preview Full Send */}
            <div className="p-3 rounded-lg border border-yellow-500/20 space-y-2">
              <p className="font-semibold text-yellow-300">{isAr ? "معاينة الإرسال الكامل" : "Preview Full Send"}</p>
              <p className="text-muted-foreground text-xs">
                {isAr
                  ? "معاينة جافة: حساب المستخدمين المؤهلين دون إرسال."
                  : "Dry run: count eligible recipients without sending."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                onClick={handlePreviewFullSend}
                disabled={sending}
              >
                {sending && previewMode === "fullPreview" ? (
                  <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />{isAr ? "جارٍ..." : "Running..."}</>
                ) : (
                  <><Loader2 className="w-3.5 h-3.5 me-1.5" />{isAr ? "معاينة" : "Preview"}</>
                )}
              </Button>
            </div>

            {/* Execute Full Send */}
            <div className="p-3 rounded-lg border border-red-500/20 space-y-2">
              <p className="font-semibold text-red-300">{isAr ? "الإرسال الكامل" : "Full Send"}</p>
              <p className="text-muted-foreground text-xs">
                {isAr
                  ? "إرسال البريد الإلكتروني للحملة إلى جميع المستخدمين المسجلين."
                  : "Send the campaign email to all registered users."}
              </p>
              {!confirmFullSend ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                  onClick={() => setConfirmFullSend(true)}
                  disabled={sending}
                >
                  <Send className="w-3.5 h-3.5 me-1.5" />{isAr ? "إرسال كامل" : "Execute Full Send"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-red-400 font-semibold">
                    {isAr ? "تأكيد الإرسال الكامل لجميع المستخدمين؟" : "Confirm full send to all users?"}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={handleFullSend}
                      disabled={sending}
                    >
                      {sending ? (
                        <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />{isAr ? "جارٍ الإرسال..." : "Sending..."}</>
                      ) : (
                        <>{isAr ? "تأكيد" : "Confirm"}</>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmFullSend(false)}
                      disabled={sending}
                    >
                      {isAr ? "إلغاء" : "Cancel"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Results */}
            {sendResult && (
              <div className="mt-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-1">
                {previewMode === "fullPreview" && (
                  <>
                    <p className="text-yellow-400 font-semibold">{isAr ? "نتيجة المعاينة" : "Preview Result"}</p>
                    <p className="text-muted-foreground">{isAr ? "سيرسل إلى:" : "Would send:"} {sendResult.would_send}</p>
                    <p className="text-muted-foreground">{isAr ? "إجمالي المستخدمين:" : "Total users:"} {sendResult.eligible_total}</p>
                    <p className="text-muted-foreground">{isAr ? "تم تخطي:" : "Skipped:"} {sendResult.skipped_total}</p>
                    {sendResult.sample && sendResult.sample.length > 0 && (
                      <div className="mt-1">
                        <p className="text-xs text-muted-foreground">{isAr ? "عينة:" : "Sample:"}</p>
                        {sendResult.sample.map((email: string) => (
                          <p key={email} className="text-xs text-muted-foreground/60 font-mono">{email}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {previewMode === "fullSend" && (
                  <>
                    <p className="text-green-400 font-semibold">{isAr ? "تم الإرسال الكامل" : "Full Send Complete"}</p>
                    <p className="text-muted-foreground">{isAr ? "تم الإرسال:" : "Sent:"} {sendResult.sent}</p>
                    <p className="text-muted-foreground">{isAr ? "فشل:" : "Failed:"} {sendResult.failed}</p>
                    <p className="text-muted-foreground">{isAr ? "المحاولة:" : "Attempted:"} {sendResult.attempted}</p>
                    {sendResult.failures?.length > 0 && (
                      <div className="text-xs text-red-400/80 mt-1">
                        {sendResult.failures.map((f: any) => (
                          <p key={f.email}>{f.email}: {f.error}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {previewMode === "test" && (
                  <>
                    <p className="text-green-400 font-semibold">{isAr ? "تم إرسال الاختبار" : "Test sent"}</p>
                    <p className="text-muted-foreground">{isAr ? "تم الإرسال:" : "Sent:"} {sendResult.sent}</p>
                    <p className="text-muted-foreground">{isAr ? "فشل:" : "Failed:"} {sendResult.failed}</p>
                    {sendResult.sent_to?.map((item: any) => (
                      <p key={item.email} className="text-xs text-muted-foreground/60 font-mono">
                        {item.email}: {item.provider_id || "no_id"}
                      </p>
                    ))}
                    {sendResult.failures?.length > 0 && (
                      <div className="text-xs text-red-400/80 mt-1">
                        {sendResult.failures.map((f: any) => (
                          <p key={f.email}>{f.email}: {f.error}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {sendError && (
              <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-red-400 font-semibold">{isAr ? "فشل الإرسال" : "Send failed"}</p>
                <p className="text-xs text-red-300/80 font-mono mt-1">{sendError}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
