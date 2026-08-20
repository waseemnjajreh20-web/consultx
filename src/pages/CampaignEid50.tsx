import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, XCircle, Eye, Clock, Users, Send, Loader2, FileText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { EID50_FIRST_50_LEADS_CSV } from "@/lib/campaigns/eid50First50Leads";
import { EID50_SECOND_50_LEADS_CSV } from "@/lib/campaigns/eid50Second50Leads";
import { buildEid50HtmlEmail, buildEid50TextEmail } from "@/lib/emailTemplates/eid50";
import { AUTH_CONFIG, isAdminEmail } from "@/config/auth";

const ADMIN_EMAILS = AUTH_CONFIG.adminEmails;

export default function CampaignEid50() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { language } = useLanguage();

  const [htmlPreview, setHtmlPreview] = useState("");
  const [textPreview, setTextPreview] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Lead import state
  const [csvText, setCsvText] = useState("");
  const [parsedLeads, setParsedLeads] = useState<any[] | null>(null);
  const [validationSummary, setValidationSummary] = useState<any>(null);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [leadSendResult, setLeadSendResult] = useState<any>(null);
  const [leadSendError, setLeadSendError] = useState<string | null>(null);
  const [dryRunDone, setDryRunDone] = useState(false);

  const isAdmin = isAdminEmail(user?.email);

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

  // ── Lead import ────────────────────────────────────────────────────────────
  const MAX_LEADS = 50;
  const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const parseAndValidate = () => {
    setParsedLeads(null);
    setValidationSummary(null);
    setDryRunResult(null);
    setDryRunDone(false);
    setLeadSendResult(null);
    setLeadSendError(null);

    const lines = csvText.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      setValidationSummary({ error: "Paste at least one lead row (header + data)" });
      return;
    }

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
    const emailIdx = headers.indexOf("email");
    const companyIdx = headers.indexOf("company_name");
    const cityIdx = headers.indexOf("city");
    const sourceUrlIdx = headers.indexOf("source_url");
    const categoryIdx = headers.indexOf("category");
    const notesIdx = headers.indexOf("notes");

    if (emailIdx === -1) {
      setValidationSummary({ error: 'Missing required column: "email"' });
      return;
    }

    const seen = new Set<string>();
    const valid: any[] = [];
    const errors: string[] = [];
    const total = lines.length - 1;

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      const rawEmail = values[emailIdx]?.trim() ?? "";
      const email = rawEmail.toLowerCase();

      if (!email) {
        errors.push(`Row ${i}: blank email`);
        continue;
      }
      if (!EMAIL_RE.test(email)) {
        errors.push(`Row ${i}: invalid email — ${rawEmail}`);
        continue;
      }
      if (seen.has(email)) {
        errors.push(`Row ${i}: duplicate — ${email}`);
        continue;
      }
      seen.add(email);

      valid.push({
        email,
        company_name: companyIdx >= 0 ? (values[companyIdx]?.trim() ?? "") : "",
        city: cityIdx >= 0 ? (values[cityIdx]?.trim() ?? "") : "",
        source_url: sourceUrlIdx >= 0 ? (values[sourceUrlIdx]?.trim() ?? "") : "",
        category: categoryIdx >= 0 ? (values[categoryIdx]?.trim() ?? "") : "",
        notes: notesIdx >= 0 ? (values[notesIdx]?.trim() ?? "") : "",
      });
    }

    if (total > MAX_LEADS) {
      setValidationSummary({
        error: `Maximum ${MAX_LEADS} leads allowed. Found ${total}.`,
        total,
      });
      return;
    }

    const missingSource = valid.filter((l) => !l.source_url).length;

    setParsedLeads(valid);
    setValidationSummary({
      total,
      valid: valid.length,
      invalid: errors.length,
      duplicates: errors.filter((e) => e.includes("duplicate")).length,
      ready: valid.length,
      missingSourceWarn: missingSource,
      errorsSample: errors.slice(0, 10),
    });
  };

  const handleDryRun = async () => {
    if (!parsedLeads || parsedLeads.length === 0) return;
    setDryRunLoading(true);
    setDryRunResult(null);
    setLeadSendResult(null);
    setLeadSendError(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-eid50-campaign", {
        body: { mode: "dryRun", leads: parsedLeads },
      });
      if (error) throw new Error(error.message || "Dry run failed");
      setDryRunResult(data);
      if (data.ready > 0) setDryRunDone(true);
    } catch (err) {
      setLeadSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setDryRunLoading(false);
    }
  };

  const handleSendLeads = async () => {
    if (!parsedLeads || parsedLeads.length === 0) return;
    setSendLoading(true);
    setLeadSendResult(null);
    setLeadSendError(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-eid50-campaign", {
        body: { mode: "send", leads: parsedLeads },
      });
      if (error) throw new Error(error.message || "Send failed");
      setLeadSendResult(data);
    } catch (err) {
      setLeadSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSendLoading(false);
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

            {/* Lead Import — First 50 External Leads */}
            <Card className="bg-card/80 backdrop-blur-xl border-border/50 border-amber-500/30 mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-amber-400">
                  <FileText className="w-4 h-4" />
                  {isAr ? "استيراد أول 50 عميلاً محتملاً" : "Import First 50 Leads"}
                </CardTitle>
              </CardHeader>
              <div className="px-6 pb-3">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <Send className="w-4 h-4 text-purple-400 shrink-0" />
                  <p className="text-xs text-purple-400">
                    {isAr
                      ? "نسخة مراقبة المشرف مفعّلة: سيتم إرسال نسخة من البريد الإلكتروني نفسه إلى بريدي المشرفين لمراقبة التسليم."
                      : "Admin monitoring copy enabled: 2 admin inboxes will receive the same production email."}
                  </p>
                </div>
              </div>
              <CardContent className="space-y-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "الصق بيانات CSV بالتنسيق: email, company_name, city, source_url, category, notes"
                    : "Paste CSV data in format: email, company_name, city, source_url, category, notes"}
                </p>
                <p className="text-xs text-muted-foreground/60 font-mono">
                  email,company_name,city,source_url,category,notes
                </p>

                <Textarea
                  className="font-mono text-xs min-h-[160px]"
                  placeholder={isAr
                    ? "info@example.com, شركة هندسية, الرياض, https://... , fire safety, lead from website\n..."
                    : "info@example.com, Engineering Co, Riyadh, https://... , fire safety, lead from website\n..."}
                  value={csvText}
                  onChange={(e) => {
                    setCsvText(e.target.value);
                    setParsedLeads(null);
                    setValidationSummary(null);
                    setDryRunResult(null);
                    setDryRunDone(false);
                    setLeadSendResult(null);
                    setLeadSendError(null);
                  }}
                />

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                    onClick={parseAndValidate}
                    disabled={!csvText.trim()}
                  >
                    <CheckCircle className="w-3.5 h-3.5 me-1.5" />
                    {isAr ? "تحقق ومعاينة" : "Validate & Preview"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                    onClick={() => {
                      setCsvText(EID50_FIRST_50_LEADS_CSV.join("\n"));
                      setParsedLeads(null);
                      setValidationSummary(null);
                      setDryRunResult(null);
                      setDryRunDone(false);
                      setLeadSendResult(null);
                      setLeadSendError(null);
                    }}
                  >
                    <FileText className="w-3.5 h-3.5 me-1.5" />
                    {isAr ? "تحميل أول 50 عميلاً" : "Load First 50 Leads"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10"
                    onClick={() => {
                      setCsvText(EID50_SECOND_50_LEADS_CSV.join("\n"));
                      setParsedLeads(null);
                      setValidationSummary(null);
                      setDryRunResult(null);
                      setDryRunDone(false);
                      setLeadSendResult(null);
                      setLeadSendError(null);
                    }}
                  >
                    <FileText className="w-3.5 h-3.5 me-1.5" />
                    {isAr ? "تحميل الدفعة الثانية (50)" : "Load Second 50 Leads"}
                  </Button>
                </div>

                {validationSummary && (
                  <>
                    {validationSummary.error ? (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-red-400 text-xs">{validationSummary.error}</p>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-1">
                        <p className="text-xs text-green-400 font-semibold">
                          {isAr ? "ملخص التحقق" : "Validation Summary"}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                          <div><span className="text-muted-foreground">{isAr ? "الإجمالي:" : "Total:"}</span> <span className="text-foreground font-mono">{validationSummary.total}</span></div>
                          <div><span className="text-green-400">{isAr ? "صالح:" : "Valid:"}</span> <span className="text-foreground font-mono">{validationSummary.valid}</span></div>
                          <div><span className="text-red-400">{isAr ? "غير صالح:" : "Invalid:"}</span> <span className="text-foreground font-mono">{validationSummary.invalid}</span></div>
                          <div><span className="text-amber-400">{isAr ? "مكرر:" : "Duplicates:"}</span> <span className="text-foreground font-mono">{validationSummary.duplicates}</span></div>
                          <div><span className="text-cyan-400">{isAr ? "جاهز:" : "Ready:"}</span> <span className="text-foreground font-mono">{validationSummary.ready}</span></div>
                        </div>
                        {validationSummary.missingSourceWarn > 0 && (
                          <p className="text-xs text-amber-400/80 mt-1">
                            <AlertTriangle className="w-3 h-3 inline me-1" />
                            {isAr
                              ? `${validationSummary.missingSourceWarn} عناوين بدون source_url`
                              : `${validationSummary.missingSourceWarn} entries missing source_url`}
                          </p>
                        )}
                        {validationSummary.errorsSample?.length > 0 && (
                          <div className="mt-1 text-xs text-red-400/70 max-h-[80px] overflow-y-auto">
                            {validationSummary.errorsSample.slice(0, 5).map((e: string, i: number) => (
                              <p key={i}>{e}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {parsedLeads && parsedLeads.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
                      onClick={handleDryRun}
                      disabled={dryRunLoading || !parsedLeads.length}
                    >
                      {dryRunLoading ? (
                        <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />{isAr ? "جارٍ التحقق..." : "Dry Running..."}</>
                      ) : (
                        <><CheckCircle className="w-3.5 h-3.5 me-1.5" />{isAr ? "تشغيل تجريبي — تحقق من الخادم" : "Dry Run — Validate on Server"}</>
                      )}
                    </Button>
                  </div>
                )}

                {dryRunResult && (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-1">
                    <p className="text-xs text-green-400 font-semibold">
                      {isAr ? "نتيجة التشغيل التجريبي" : "Dry Run Result"}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                      <div><span className="text-muted-foreground">{isAr ? "الإجمالي:" : "Total:"}</span> <span className="text-foreground font-mono">{dryRunResult.total}</span></div>
                      <div><span className="text-green-400">{isAr ? "صالح:" : "Valid:"}</span> <span className="text-foreground font-mono">{dryRunResult.valid}</span></div>
                      <div><span className="text-red-400">{isAr ? "غير صالح:" : "Invalid:"}</span> <span className="text-foreground font-mono">{dryRunResult.invalid}</span></div>
                      <div><span className="text-amber-400">{isAr ? "مكرر:" : "Duplicates:"}</span> <span className="text-foreground font-mono">{dryRunResult.duplicates}</span></div>
                      <div><span className="text-cyan-400">{isAr ? "جاهز:" : "Ready:"}</span> <span className="text-foreground font-mono">{dryRunResult.ready}</span></div>
                      <div><span className="text-purple-400">{isAr ? "مراقبة المشرف:" : "Admin Monitor:"}</span> <span className="text-foreground font-mono">{dryRunResult.admin_monitoring}</span></div>
                    </div>
                    <p className="text-xs text-purple-400/80 mt-1 flex items-center gap-1">
                      <Send className="w-3 h-3" />
                      {isAr
                        ? `سيتم إرسال ${dryRunResult.total_messages} رسالة إجمالاً (${dryRunResult.ready} خارجية + ${dryRunResult.admin_monitoring} نسخة مراقبة للمشرف)`
                        : `Total ${dryRunResult.total_messages} messages will be sent (${dryRunResult.ready} external + ${dryRunResult.admin_monitoring} admin monitoring copies)`}
                    </p>
                    {dryRunResult.ready > 0 && (
                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={handleSendLeads}
                          disabled={sendLoading}
                        >
                          {sendLoading ? (
                            <><Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />{isAr ? "جارٍ الإرسال..." : "Sending..."}</>
                          ) : (
                            <><Send className="w-3.5 h-3.5 me-1.5" />{isAr ? "إرسال الحملة" : "Execute Send"}</>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {leadSendResult && (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-1">
                    <p className="text-green-400 font-semibold text-xs">
                      {isAr ? "تم الإرسال" : "Send complete"}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 text-xs">
                      <div><span className="text-muted-foreground">{isAr ? "تم الإرسال:" : "Sent:"}</span> <span className="text-foreground font-mono">{leadSendResult.sent}</span></div>
                      <div><span className="text-muted-foreground">{isAr ? "خارجي:" : "External:"}</span> <span className="text-foreground font-mono">{leadSendResult.external_sent ?? leadSendResult.sent}</span></div>
                      <div><span className="text-purple-400">{isAr ? "مراقبة:" : "Admin Monitor:"}</span> <span className="text-foreground font-mono">{leadSendResult.admin_monitoring_sent ?? 0}</span></div>
                    </div>
                    {leadSendResult.failed > 0 && (
                      <p className="text-xs text-red-400">
                        {isAr ? "فشل:" : "Failed:"} {leadSendResult.failed}
                      </p>
                    )}
                    {leadSendResult.duplicate_monitor_skipped > 0 && (
                      <p className="text-xs text-amber-400/80">
                        {isAr
                          ? `تخطي ${leadSendResult.duplicate_monitor_skipped} نسخة مراقبة مكررة (البريد موجود بالفعل في القائمة)`
                          : `Skipped ${leadSendResult.duplicate_monitor_skipped} duplicate monitoring copy (admin email already in lead list)`}
                      </p>
                    )}
                    {leadSendResult.failures?.length > 0 && (
                      <div className="text-xs text-red-400/70 max-h-[80px] overflow-y-auto mt-1">
                        {leadSendResult.failures.slice(0, 5).map((f: any, i: number) => (
                          <p key={i}>{f.email}: {f.error}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {leadSendError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-red-400 text-xs">{leadSendError}</p>
                  </div>
                )}
              </CardContent>
            </Card>

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
