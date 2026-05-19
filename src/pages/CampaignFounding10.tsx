/**
 * Admin Campaign Preview — Founding Engineers Offer.
 *
 * Admin-only page (route /admin/campaigns/founding10). Reuses the same
 * email-list admin gate as Admin.tsx and admin-stats.
 *
 * Shows the campaign summary, the HTML email preview in an iframe,
 * a plain-text preview, eligibility counts, and Send Center actions
 * (dry run, send, CSV export).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Loader2, Send, Eye, Download, ShieldCheck,
  AlertTriangle, CheckCircle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isAllowedAdminEmail } from "@/lib/adminEntitlementOverride";
import {
  FOUNDING10_CODE,
  FOUNDING10_ENDS_AT,
  FOUNDING10_OWNER_TEST_UTM,
  FOUNDING10_STARTS_AT,
  buildFounding10Url,
} from "@/lib/campaigns/founding10";
import {
  FOUNDING10_EMAIL_DEFAULT_SUBJECT,
  buildFounding10HtmlEmail,
  buildFounding10TextEmail,
} from "@/lib/emailTemplates/founding10";

interface PreviewTotals {
  total_users: number;
  eligible: number;
  skipped: number;
  skipped_breakdown: Record<string, number>;
}

interface PreviewResponse {
  mode: "preview";
  campaign_code: string;
  subject: string;
  totals: PreviewTotals;
  eligible_sample: string[];
}

interface DryRunResponse {
  mode: "send";
  dry_run: true;
  campaign_code: string;
  subject: string;
  would_send: number;
  eligible_total: number;
  skipped_total: number;
  limit: number;
  sample: string[];
}

interface SendResponse {
  mode: "send";
  dry_run: false;
  campaign_code: string;
  subject: string;
  sent: number;
  failed: number;
  attempted: number;
  eligible_total: number;
  skipped_total: number;
  failures: Array<{ email: string; error: string }>;
}

type ActionResult = DryRunResponse | SendResponse | null;

export default function CampaignFounding10() {
  const navigate = useNavigate();
  const { user, session, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const isAdmin = isAllowedAdminEmail(user?.email);

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastAction, setLastAction] = useState<ActionResult>(null);

  const ownerTestUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://www.consultx.app";
    return buildFounding10Url(origin, FOUNDING10_OWNER_TEST_UTM);
  }, []);

  const htmlEmail = useMemo(
    () => buildFounding10HtmlEmail({ recipientEmail: user?.email ?? "engineer@example.com" }),
    [user?.email],
  );
  const textEmail = useMemo(
    () => buildFounding10TextEmail({ recipientEmail: user?.email ?? "engineer@example.com" }),
    [user?.email],
  );

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
    if (!authLoading && user && !isAdmin) navigate("/");
  }, [user, authLoading, isAdmin, navigate]);

  const runPreview = useCallback(async () => {
    if (!session) return;
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-founding10-campaign", {
        body: { mode: "preview" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw new Error(error.message);
      setPreview(data as PreviewResponse);
    } catch (err) {
      toast({
        title: "Preview failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setPreviewLoading(false);
    }
  }, [session, toast]);

  useEffect(() => {
    if (isAdmin && session) runPreview();
  }, [isAdmin, session, runPreview]);

  const runDryRun = useCallback(
    async (limit: number) => {
      if (!session) return;
      setActionLoading(true);
      setLastAction(null);
      try {
        const { data, error } = await supabase.functions.invoke("send-founding10-campaign", {
          body: { mode: "send", dryRun: true, limit },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (error) throw new Error(error.message);
        setLastAction(data as DryRunResponse);
        toast({
          title: "Dry run complete",
          description: `${(data as DryRunResponse).would_send} email(s) would be sent.`,
        });
      } catch (err) {
        toast({
          title: "Dry run failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setActionLoading(false);
      }
    },
    [session, toast],
  );

  const runRealSend = useCallback(
    async (limit: number) => {
      if (!session) return;
      const confirmed = window.confirm(
        `Send up to ${limit} emails NOW to eligible users for FOUNDING10?\n\n` +
          `This is a real send and cannot be undone.`,
      );
      if (!confirmed) return;

      setActionLoading(true);
      setLastAction(null);
      try {
        const { data, error } = await supabase.functions.invoke("send-founding10-campaign", {
          body: { mode: "send", dryRun: false, limit },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (error) throw new Error(error.message);
        setLastAction(data as SendResponse);
        const r = data as SendResponse;
        toast({
          title: r.failed === 0 ? "Send complete" : "Send finished with failures",
          description: `Sent ${r.sent}, failed ${r.failed} (of ${r.attempted} attempted)`,
          variant: r.failed > 0 ? "destructive" : "default",
        });
        runPreview(); // refresh skipped/already_sent totals
      } catch (err) {
        toast({
          title: "Send failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setActionLoading(false);
      }
    },
    [session, toast, runPreview],
  );

  const downloadCsv = useCallback(async () => {
    if (!session) return;
    setActionLoading(true);
    try {
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
      const url = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/send-founding10-campaign`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "export" }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "founding10-eligible.csv";
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      toast({
        title: "CSV export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }, [session, toast]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/30">
        <Button variant="ghost" onClick={() => navigate("/admin")}>
          <ArrowLeft className="me-2 w-4 h-4" />
          Back to Admin
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Admin · Campaigns
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <Badge className="bg-primary/15 text-primary border border-primary/30 text-xs font-medium mb-2">
            FOUNDING10 · Founding Engineers Offer
          </Badge>
          <h1 className="text-2xl font-bold">Founding Engineers Offer — Campaign Preview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Active window {new Date(FOUNDING10_STARTS_AT).toLocaleDateString()} → {" "}
            {new Date(FOUNDING10_ENDS_AT).toLocaleDateString()}. Promo charges first month at 10 SAR for the Pro plan.
            Renewals fall back to the standard Pro price.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {previewLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Counting eligible recipients…
              </div>
            )}
            {!previewLoading && preview && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Total users" value={preview.totals.total_users} />
                  <Stat label="Eligible" value={preview.totals.eligible} highlight />
                  <Stat label="Skipped" value={preview.totals.skipped} />
                </div>
                {preview.totals.skipped_breakdown && (
                  <div className="text-xs text-muted-foreground">
                    Skipped breakdown:&nbsp;
                    {Object.entries(preview.totals.skipped_breakdown).map(([k, v]) => (
                      <span key={k} className="me-3">
                        <span className="text-foreground/80">{k}</span>: {v}
                      </span>
                    ))}
                  </div>
                )}
                {preview.eligible_sample.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    First eligible: <span className="text-foreground/80 font-mono">{preview.eligible_sample.join(", ")}</span>
                  </div>
                )}
              </>
            )}
            <div className="pt-2 flex flex-wrap gap-2">
              <Button onClick={runPreview} variant="outline" size="sm" disabled={previewLoading || actionLoading}>
                <RefreshCw className={`me-2 w-4 h-4 ${previewLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                onClick={() => runDryRun(preview?.totals.eligible ?? 0)}
                variant="outline"
                size="sm"
                disabled={!preview?.totals.eligible || actionLoading}
              >
                <Eye className="me-2 w-4 h-4" /> Dry run (all eligible)
              </Button>
              <Button
                onClick={() => runDryRun(5)}
                variant="outline"
                size="sm"
                disabled={!preview?.totals.eligible || actionLoading}
              >
                <Eye className="me-2 w-4 h-4" /> Dry run (5)
              </Button>
              <Button
                onClick={() => runRealSend(5)}
                size="sm"
                disabled={!preview?.totals.eligible || actionLoading}
              >
                <Send className="me-2 w-4 h-4" /> Real send (first 5)
              </Button>
              <Button
                onClick={() => runRealSend(preview?.totals.eligible ?? 0)}
                size="sm"
                variant="destructive"
                disabled={!preview?.totals.eligible || actionLoading}
              >
                <Send className="me-2 w-4 h-4" /> Real send (all eligible)
              </Button>
              <Button onClick={downloadCsv} variant="ghost" size="sm" disabled={actionLoading}>
                <Download className="me-2 w-4 h-4" /> Export CSV
              </Button>
            </div>
            {actionLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Working…
              </div>
            )}
          </CardContent>
        </Card>

        {lastAction && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {"dry_run" in lastAction && lastAction.dry_run ? (
                  <>
                    <Eye className="w-4 h-4 text-primary" /> Last dry run
                  </>
                ) : (lastAction as SendResponse).failed > 0 ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-yellow-500" /> Send finished (with failures)
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 text-primary" /> Send complete
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm font-mono text-muted-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(lastAction, null, 2)}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email subject</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="font-mono p-2 rounded bg-muted/40 text-foreground/90">
              {FOUNDING10_EMAIL_DEFAULT_SUBJECT}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CTA URL (owner test)</CardTitle>
          </CardHeader>
          <CardContent className="text-xs font-mono break-all">
            <a href={ownerTestUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              {ownerTestUrl}
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">HTML preview</CardTitle>
          </CardHeader>
          <CardContent>
            <iframe
              title="Founding10 email HTML preview"
              srcDoc={htmlEmail}
              sandbox="allow-same-origin"
              style={{
                width: "100%",
                height: 720,
                border: "1px solid rgba(0,212,255,0.18)",
                borderRadius: 10,
                background: "#06090e",
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plain-text preview</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap font-mono p-3 rounded bg-muted/30 text-foreground/85">
              {textEmail}
            </pre>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Eligibility = registered user with no active paid subscription, no admin gate, and
          no prior FOUNDING10 send marker on app_metadata.
          Promo code: <span className="font-mono text-primary">{FOUNDING10_CODE}</span>.
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{
        background: highlight ? "rgba(0,212,255,0.06)" : "rgba(255,255,255,0.02)",
        borderColor: highlight ? "rgba(0,212,255,0.35)" : "rgba(255,255,255,0.08)",
      }}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className="text-2xl font-bold mt-1"
        style={{ color: highlight ? "#00D4FF" : undefined }}
      >
        {value}
      </div>
    </div>
  );
}
