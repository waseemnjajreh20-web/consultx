import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowLeft, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail } from "@/config/auth";
// perf_events / slo_targets / probe_state are pending-apply tables (see
// docs/db/20260903_perf_events.sql) not yet present in the generated
// Database type (src/integrations/supabase/types.ts is machine-generated
// from the live schema — regenerating it after the owner applies that SQL
// is a follow-up, not part of this change). aggregateStats/percentile are
// reused as-is from the edge function's own pure module (already unit
// tested in src/__tests__/syntheticProbe.test.ts) rather than re-implemented
// here — same cross-directory pure-module pattern evals/ and __tests__ use
// for supabase/functions/fire-safety-chat/*.ts.
import { aggregateStats, type AggregatedStats, type PerfEventRowForStats } from "../../supabase/functions/synthetic-probe/logic.ts";

// Untyped view of the same client instance — see the comment above for why.
const db = supabase as unknown as { from: (table: string) => any };

interface PerfEventRow {
  ts: string;
  mode: string;
  ok: boolean;
  first_status_ms: number | null;
  first_text_ms: number | null;
  done_ms: number | null;
  chars: number;
  sources_count: number | null;
  engine: string | null;
  error_code: string | null;
}

interface CronStatusValue {
  status_code: number | null;
  checked_at: string;
}

const MODES = ["primary", "standard", "analysis"] as const;
const MODE_LABELS: Record<string, string> = {
  primary: "الرئيسي",
  standard: "الاستشاري",
  analysis: "التحليلي",
};

function toStatsRow(r: PerfEventRow): PerfEventRowForStats {
  return {
    first_status_ms: r.first_status_ms,
    first_text_ms: r.first_text_ms,
    done_ms: r.done_ms,
    chars: r.chars,
    ok: r.ok,
    error_code: r.error_code,
  };
}

/** ms -> "1.2ث" (seconds) above 1000ms, else "350مث" (milliseconds). "—" for null. */
function fmtMs(v: number | null): string {
  if (v === null) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(1)}ث` : `${Math.round(v)}مث`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminHealth() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const isAdmin = isAdminEmail(user?.email);

  const [rows, setRows] = useState<PerfEventRow[]>([]);
  const [cronStatus, setCronStatus] = useState<CronStatusValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
    if (!authLoading && user && !isAdmin) navigate("/");
  }, [user, authLoading, isAdmin, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [eventsRes, cronRes] = await Promise.all([
        db
          .from("perf_events")
          .select("ts, mode, ok, first_status_ms, first_text_ms, done_ms, chars, sources_count, engine, error_code")
          .eq("source", "synthetic")
          .gte("ts", since)
          .order("ts", { ascending: false })
          .limit(500),
        db.from("probe_state").select("value").eq("key", "cron_status").maybeSingle(),
      ]);
      if (eventsRes.error) throw new Error(eventsRes.error.message);
      setRows((eventsRes.data ?? []) as PerfEventRow[]);
      if (!cronRes.error && cronRes.data?.value) {
        setCronStatus(cronRes.data.value as CronStatusValue);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "تعذّر تحميل بيانات المراقبة";
      // A missing table (SQL not applied yet) surfaces as a PostgREST "relation
      // does not exist" error — give the admin the exact next step instead of
      // a bare error string.
      setError(
        message.toLowerCase().includes("does not exist") || message.toLowerCase().includes("schema cache")
          ? "الجداول غير موجودة بعد — طبّق docs/db/20260903_perf_events.sql (راجع docs/launch/synthetic-probe-runbook.md)."
          : message,
      );
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, fetchData]);

  if (authLoading || (!loadedOnce && loading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const overall = aggregateStats(rows.map(toStatsRow));
  const perMode: Record<string, AggregatedStats> = {};
  for (const mode of MODES) perMode[mode] = aggregateStats(rows.filter((r) => r.mode === mode).map(toStatsRow));
  const last20 = rows.slice(0, 20);
  const cronKnown = cronStatus?.status_code != null;
  const cronOk = cronStatus?.status_code === 200;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="fixed inset-0 blueprint-grid opacity-20 pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card/60 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gradient">صحة النظام</h1>
            <p className="text-xs text-muted-foreground">مراقبة الأداء التلقائية — آخر 24 ساعة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 me-1" />
            لوحة التحكم
          </Button>
        </div>
      </header>

      <div className="relative z-10 p-6 pb-24 md:pb-6 max-w-6xl mx-auto space-y-6">
        {error && (
          <Card className="bg-destructive/5 border-destructive/40">
            <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* ===== SUMMARY CARDS ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card/80 backdrop-blur-xl border-border/50">
            <CardContent className="p-5">
              <p className="text-3xl font-bold">{overall.count}</p>
              <p className="text-sm text-muted-foreground mt-1">إجمالي الفحوصات (24س)</p>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-xl border-border/50">
            <CardContent className="p-5">
              <p className={`text-3xl font-bold ${overall.okRate !== null && overall.okRate < 0.99 ? "text-destructive" : "text-primary"}`}>
                {overall.okRate !== null ? `${(overall.okRate * 100).toFixed(1)}%` : "—"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">نسبة النجاح</p>
            </CardContent>
          </Card>

          <Card className={`bg-card/80 backdrop-blur-xl border-border/50 ${overall.emptyStreams > 0 ? "border-destructive/40" : ""}`}>
            <CardContent className="p-5">
              <p className={`text-3xl font-bold ${overall.emptyStreams > 0 ? "text-destructive" : "text-primary"}`}>{overall.emptyStreams}</p>
              <p className="text-sm text-muted-foreground mt-1">ردود فارغة تماماً</p>
            </CardContent>
          </Card>

          <Card className={`bg-card/80 backdrop-blur-xl border-border/50 ${cronKnown && !cronOk ? "border-destructive/40" : ""}`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                {!cronKnown ? (
                  <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                ) : cronOk ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <XCircle className="w-5 h-5 text-destructive" />
                )}
                <p className="text-2xl font-bold">{cronStatus?.status_code ?? "—"}</p>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                آخر حالة cron{cronStatus?.checked_at ? ` · ${fmtTime(cronStatus.checked_at)}` : ""}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ===== PER-MODE p50/p95 ===== */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">الأداء حسب الوضع (p50 / p95)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/40">
                    <th className="text-start py-2 px-2 font-medium">الوضع</th>
                    <th className="text-start py-2 px-2 font-medium">عدد</th>
                    <th className="text-start py-2 px-2 font-medium">نسبة النجاح</th>
                    <th className="text-start py-2 px-2 font-medium">أول استجابة</th>
                    <th className="text-start py-2 px-2 font-medium">أول نص</th>
                    <th className="text-start py-2 px-2 font-medium">الاكتمال</th>
                  </tr>
                </thead>
                <tbody>
                  {MODES.map((mode) => {
                    const s = perMode[mode];
                    return (
                      <tr key={mode} className="border-b border-border/20">
                        <td className="py-2 px-2 font-medium">{MODE_LABELS[mode]}</td>
                        <td className="py-2 px-2 text-muted-foreground">{s.count}</td>
                        <td className="py-2 px-2">{s.okRate !== null ? `${(s.okRate * 100).toFixed(0)}%` : "—"}</td>
                        <td className="py-2 px-2 font-mono text-xs">
                          {fmtMs(s.p50FirstStatusMs)} / {fmtMs(s.p95FirstStatusMs)}
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">
                          {fmtMs(s.p50FirstTextMs)} / {fmtMs(s.p95FirstTextMs)}
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">
                          {fmtMs(s.p50DoneMs)} / {fmtMs(s.p95DoneMs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ===== LAST 20 RUNS ===== */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">آخر 20 عملية فحص</CardTitle>
          </CardHeader>
          <CardContent>
            {last20.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                لا توجد بيانات بعد — راجع docs/launch/synthetic-probe-runbook.md لتفعيل المراقبة.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/40">
                      <th className="text-start py-2 px-2 font-medium">الوقت</th>
                      <th className="text-start py-2 px-2 font-medium">الوضع</th>
                      <th className="text-start py-2 px-2 font-medium">الحالة</th>
                      <th className="text-start py-2 px-2 font-medium">أول استجابة</th>
                      <th className="text-start py-2 px-2 font-medium">أول نص</th>
                      <th className="text-start py-2 px-2 font-medium">الاكتمال</th>
                      <th className="text-start py-2 px-2 font-medium">أحرف</th>
                      <th className="text-start py-2 px-2 font-medium">المحرك</th>
                    </tr>
                  </thead>
                  <tbody>
                    {last20.map((r, i) => (
                      <tr key={`${r.ts}-${r.mode}-${i}`} className="border-b border-border/20">
                        <td className="py-2 px-2 text-muted-foreground font-mono">{fmtTime(r.ts)}</td>
                        <td className="py-2 px-2">{MODE_LABELS[r.mode] ?? r.mode}</td>
                        <td className="py-2 px-2">
                          <Badge
                            variant="outline"
                            className={r.ok ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive"}
                          >
                            {r.ok ? "نجاح" : r.error_code ?? "فشل"}
                          </Badge>
                        </td>
                        <td className="py-2 px-2">{fmtMs(r.first_status_ms)}</td>
                        <td className="py-2 px-2">{fmtMs(r.first_text_ms)}</td>
                        <td className="py-2 px-2">{fmtMs(r.done_ms)}</td>
                        <td className="py-2 px-2 text-muted-foreground">{r.chars}</td>
                        <td className="py-2 px-2 text-muted-foreground">{r.engine ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
