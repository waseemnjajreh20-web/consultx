import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, XCircle, Eye, Clock, Users, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import {
  EID50_CAMPAIGN,
  EID50_CODE,
  EID50_SUBJECTS,
  isEid50Active,
  getEid50SubscribeUrl,
} from "@/lib/campaigns/eid50";
import { buildEid50HtmlEmail, buildEid50TextEmail } from "@/lib/emailTemplates/eid50";

const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];

export default function CampaignEid50() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { language } = useLanguage();

  const [htmlPreview, setHtmlPreview] = useState("");
  const [textPreview, setTextPreview] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email.toLowerCase()) : false;

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
    if (!authLoading && user && !isAdmin) navigate("/");
  }, [user, authLoading, isAdmin, navigate]);

  useEffect(() => {
    setHtmlPreview(buildEid50HtmlEmail());
    setTextPreview(buildEid50TextEmail());
  }, []);

  const handleSendTest = async () => {
    setSending(true);
    setSendResult(null);
    setSendError(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-eid50-campaign", {
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

  if (authLoading) return null;
  if (!isAdmin) return null;

  const isAr = language !== "en";
  const active = isEid50Active();
  const ctaUrl = getEid50SubscribeUrl("email", "outbound", "pro");
  const enterpriseCtaUrl = getEid50SubscribeUrl("email", "outbound", "enterprise_team");

  return (
    <div className="min-h-screen bg-background" dir={isAr ? "rtl" : "ltr"}>
      <div className="fixed inset-0 blueprint-grid opacity-20 pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card/60 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-gradient">{EID50_CAMPAIGN.title.en}</h1>
            <p className="text-xs text-muted-foreground">Campaign Code: {EID50_CODE}</p>
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
                  ? `VITE_EID50_LIVE = ${active ? '"true"' : 'غير "true"'}`
                  : `VITE_EID50_LIVE = ${active ? '"true"' : 'not "true"'}`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Subject Selection */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50 border-gold-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="default" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">50% OFF</Badge>
              {isAr ? "موضوع البريد الإلكتروني" : "Email Subject"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-green-400 font-semibold text-xs uppercase tracking-wider">{isAr ? "الموضوع الموصى به" : "RECOMMENDED"}</p>
              <p className="mt-1 text-foreground font-mono text-sm">{EID50_SUBJECTS.recommended}</p>
            </div>
            <div className="p-3 rounded-lg bg-card border border-border/30 space-y-1">
              <p className="text-muted-foreground text-xs uppercase tracking-wider">{isAr ? "بدائل" : "ALTERNATIVES"}</p>
              {EID50_SUBJECTS.alternatives.map((s, i) => (
                <p key={i} className="text-muted-foreground/80 font-mono text-xs">{i + 1}. {s}</p>
              ))}
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
            <div><span className="text-muted-foreground">{isAr ? "الكود:" : "Code:"}</span> <span className="font-mono">{EID50_CODE}</span></div>
            <div><span className="text-muted-foreground">{isAr ? "العنوان (EN):" : "Title (EN):"}</span> {EID50_CAMPAIGN.title.en}</div>
            <div><span className="text-muted-foreground">{isAr ? "العنوان (AR):" : "Title (AR):"}</span> {EID50_CAMPAIGN.title.ar}</div>
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                <span className="font-mono">50% OFF</span>
              </Badge>
              <span className="text-muted-foreground">{isAr ? "خصم 50٪ على أول شهر" : "50% off first month"}</span>
            </div>
            <div><span className="text-muted-foreground">{isAr ? "المدة:" : "Duration:"}</span> {EID50_CAMPAIGN.durationDays} {isAr ? "أيام" : "days"}</div>
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{isAr ? "التواريخ:" : "Dates:"}</span> <span className="text-amber-400 font-semibold">{EID50_CAMPAIGN.dateRange.en}</span>
            </div>
            <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
              <div>
                <p className="text-muted-foreground text-xs">{isAr ? "رابط CTA (Pro):" : "CTA URL (Pro):"}</p>
                <a href={ctaUrl} className="text-primary underline break-all text-xs font-mono" target="_blank" rel="noopener noreferrer">{ctaUrl}</a>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{isAr ? "رابط CTA (Enterprise):" : "CTA URL (Enterprise):"}</p>
                <a href={enterpriseCtaUrl} className="text-primary underline break-all text-xs font-mono" target="_blank" rel="noopener noreferrer">{enterpriseCtaUrl}</a>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Send Admin Test */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50 border-cyan-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-cyan-400">
              <Send className="w-4 h-4" />
              {isAr ? "إرسال اختبار للمشرف" : "Send Admin Test"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {isAr
                ? "أرسل بريد الحملة إلى حسابات المشرفين فقط لاختبار المظهر والتسليم."
                : "Send the campaign email to admin accounts only to test rendering and delivery."}
            </p>
            <p className="text-xs text-muted-foreground/60 font-mono">
              {ADMIN_EMAILS.join(", ")}
            </p>
            <p className="text-xs text-cyan-400/60 font-mono">
              {isAr ? "الموضوع: " : "Subject: "}{EID50_SUBJECTS.recommended} [ADMIN TEST]
            </p>
            <Button
              variant="outline"
              size="sm"
              className="border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
              onClick={handleSendTest}
              disabled={sending}
            >
              {sending ? (
                <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />{isAr ? "جارٍ الإرسال..." : "Sending..."}</>
              ) : (
                <><Send className="w-3.5 h-3.5 me-1.5" />{isAr ? "إرسال اختبار" : "Send Admin Test"}</>
              )}
            </Button>

            {/* Awaiting Lead List */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Users className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <p className="text-amber-300 font-semibold text-xs">
                  {isAr ? "بانتظار قائمة العملاء المحتملين" : "Awaiting Owner Lead List"}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  {isAr
                    ? "لم يتم استيراد قائمة جهات الاتصال بعد. سيوفر المالك أول 50 بريداً إلكترونياً."
                    : "No recipient list imported yet. Owner will provide the first 50 leads."}
                </p>
              </div>
            </div>

            {sendResult && (
              <div className="mt-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-1">
                <p className="text-green-400 font-semibold">{isAr ? "تم إرسال الاختبار" : "Test sent successfully"}</p>
                <p className="text-muted-foreground">{isAr ? "تم الإرسال:" : "Sent:"} {sendResult.sent}</p>
                <p className="text-muted-foreground">{isAr ? "فشل:" : "Failed:"} {sendResult.failed}</p>
                <p className="text-xs text-muted-foreground/60">{isAr ? "الموضوع:" : "Subject:"} {sendResult.subject}</p>
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

        {/* Email Preview - HTML */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4" />
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
      </div>
    </div>
  );
}
