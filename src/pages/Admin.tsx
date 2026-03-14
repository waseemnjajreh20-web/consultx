import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, CreditCard, TrendingUp, Database, Play, RefreshCw,
  CheckCircle, XCircle, Clock, AlertCircle, ArrowLeft,
  Loader2, Shield, BarChart3, Network, FileText, Zap, StopCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import consultxIcon from "@/assets/consultx-icon.png";

const ADMIN_EMAILS = ["njajrehwaseem@gmail.com", "waseemnjajreh20@gmail.com"];

interface AdminStats {
  users: { total: number; recent7Days: number };
  subscriptions: { active: number; total: number; breakdown: Record<string, number> };
  revenue: { totalHalala: number; totalSAR: string; transactions: number };
  knowledgeGraph: {
    nodes: number; edges: number; communities: number;
    files: Array<{
      id: string; file_name: string; status: string; sbc_source: string;
      nodes_extracted: number; edges_extracted: number;
      last_processed_chunk: number; error_message?: string; processed_at?: string;
    }>;
  };
}

const statusColors: Record<string, string> = {
  done: "bg-primary/20 text-primary border-primary/30",
  processing: "bg-accent/20 text-accent border-accent/30",
  partial: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  failed: "bg-destructive/20 text-destructive border-destructive/30",
  pending: "bg-muted/50 text-muted-foreground border-border",
};

const statusIcons: Record<string, React.ReactNode> = {
  done: <CheckCircle className="w-3 h-3" />,
  processing: <Loader2 className="w-3 h-3 animate-spin" />,
  partial: <Clock className="w-3 h-3" />,
  failed: <XCircle className="w-3 h-3" />,
  pending: <AlertCircle className="w-3 h-3" />,
};

export default function Admin() {
  const navigate = useNavigate();
  const { user, session, loading: authLoading } = useAuth();
  const { dir } = useLanguage();
  const { toast } = useToast();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [indexerAction, setIndexerAction] = useState<"index" | "communities" | "reset">("index");

  // Auto-indexer state
  const [autoIndexing, setAutoIndexing] = useState(false);
  const [autoIndexLog, setAutoIndexLog] = useState<string[]>([]);
  const [autoIndexProgress, setAutoIndexProgress] = useState({ done: 0, total: 18, remaining: 18 });
  const stopAutoRef = useRef(false);

  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false;

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
    if (!authLoading && user && !isAdmin) navigate("/");
  }, [user, authLoading, isAdmin, navigate]);

  const fetchStats = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-stats", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      setStats(data);
    } catch (err) {
      toast({ title: "خطأ في تحميل الإحصائيات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [session, toast]);

  useEffect(() => {
    if (isAdmin && session) fetchStats();
  }, [isAdmin, session, fetchStats]);

  const runIndexer = async () => {
    if (!session) return;
    setIndexing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sbc-graph-indexer", {
        body: { action: indexerAction },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      toast({ title: "✅ تم التنفيذ", description: data?.message || "العملية اكتملت" });
      await fetchStats();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setIndexing(false);
    }
  };

  // ===== AUTO SEQUENTIAL INDEXER =====
  const startAutoIndex = async () => {
    if (!session) return;
    setAutoIndexing(true);
    stopAutoRef.current = false;
    setAutoIndexLog([]);

    const log = (msg: string) => setAutoIndexLog(prev => [...prev, `${new Date().toLocaleTimeString("ar-SA")} — ${msg}`]);

    log("🚀 بدأت الفهرسة التلقائية...");

    let remaining = 999;
    let round = 0;

    while (remaining > 0 && !stopAutoRef.current) {
      round++;
      log(`📄 جولة ${round}: استدعاء الـ indexer...`);

      try {
        const { data, error } = await supabase.functions.invoke("sbc-graph-indexer", {
          body: { action: "index" },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (error) throw new Error(error.message);

        remaining = data?.remaining ?? 0;
        const processed = data?.processed || "—";
        const isPartial = data?.partial;
        const nodes = data?.totalNodes ?? 0;
        const edges = data?.totalEdges ?? 0;

        log(`${isPartial ? "⏸️ جزئي" : "✅ مكتمل"}: ${processed} (+${nodes} عقدة, +${edges} علاقة) — متبقي: ${remaining}`);

        setAutoIndexProgress(prev => ({
          total: prev.total,
          done: prev.total - remaining,
          remaining,
        }));

        if (remaining === 0) {
          log("🎉 اكتملت فهرسة جميع الملفات! جارٍ بناء المجتمعات...");
          const { data: commData, error: commError } = await supabase.functions.invoke("sbc-graph-indexer", {
            body: { action: "communities" },
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (commError) log(`⚠️ خطأ في بناء المجتمعات: ${commError.message}`);
          else log("✅ تم بناء المجتمعات المعرفية بنجاح!");
          break;
        }

        // Delay 3s between calls to respect rate limits
        await new Promise(r => setTimeout(r, 3000));

      } catch (err: any) {
        log(`❌ خطأ: ${err.message}`);
        await new Promise(r => setTimeout(r, 5000)); // longer wait on error
        if (round > 50) { log("⛔ توقف تلقائي بعد 50 جولة"); break; }
      }
    }

    if (stopAutoRef.current) log("⛔ تم الإيقاف يدوياً");

    setAutoIndexing(false);
    await fetchStats();
    toast({ title: "انتهت الفهرسة التلقائية" });
  };

  const stopAutoIndex = () => {
    stopAutoRef.current = true;
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const kgDoneFiles = stats?.knowledgeGraph.files.filter(f => f.status === "done").length ?? 0;
  const kgTotalFiles = stats?.knowledgeGraph.files.length ?? 0;
  const kgProgress = kgTotalFiles > 0 ? Math.round((kgDoneFiles / kgTotalFiles) * 100) : 0;

  // Use live progress if auto-indexing, else use stats
  const liveTotal = autoIndexing ? autoIndexProgress.total : Math.max(18, kgTotalFiles);
  const liveDone = autoIndexing ? autoIndexProgress.done : kgDoneFiles;
  const liveProgress = liveTotal > 0 ? Math.round((liveDone / liveTotal) * 100) : kgProgress;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="fixed inset-0 blueprint-grid opacity-20 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card/60 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <img src={consultxIcon} alt="ConsultX" className="w-8 h-8" />
          <div>
            <h1 className="text-lg font-bold text-gradient">لوحة التحكم</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Shield className="w-3 h-3" /> مدير النظام
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 me-1" />
            الرئيسية
          </Button>
        </div>
      </header>

      <div className="relative z-10 p-6 max-w-6xl mx-auto space-y-6">

        {/* ===== STATS CARDS ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card/80 backdrop-blur-xl border-border/50">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                  +{stats?.users.recent7Days ?? 0} هذا الأسبوع
                </Badge>
              </div>
              <p className="text-3xl font-bold">{stats?.users.total ?? 0}</p>
              <p className="text-sm text-muted-foreground mt-1">إجمالي المستخدمين</p>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-xl border-border/50">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <CreditCard className="w-5 h-5 text-accent" />
                </div>
                <Badge variant="outline" className="text-xs border-accent/30 text-accent">
                  من {stats?.subscriptions.total ?? 0}
                </Badge>
              </div>
              <p className="text-3xl font-bold">{stats?.subscriptions.active ?? 0}</p>
              <p className="text-sm text-muted-foreground mt-1">اشتراك نشط / تجريبي</p>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-xl border-border/50">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                </div>
                <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">
                  {stats?.revenue.transactions ?? 0} معاملة
                </Badge>
              </div>
              <p className="text-3xl font-bold">{stats?.revenue.totalSAR ?? "0.00"}</p>
              <p className="text-sm text-muted-foreground mt-1">إجمالي الإيرادات (ريال)</p>
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-xl border-border/50">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Network className="w-5 h-5 text-purple-400" />
                </div>
                <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400">
                  {kgDoneFiles}/{Math.max(18, kgTotalFiles)} ملف
                </Badge>
              </div>
              <p className="text-3xl font-bold">{stats?.knowledgeGraph.nodes ?? 0}</p>
              <p className="text-sm text-muted-foreground mt-1">عقدة في المعرفة الرسومية</p>
            </CardContent>
          </Card>
        </div>

        {/* ===== SBC DATABASE AUTO-INDEXER ===== */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50 border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              فهرسة قاعدة بيانات SBC 201 & SBC 801
              {autoIndexing && <Badge className="bg-primary/20 text-primary border-primary/30 animate-pulse">جارٍ التنفيذ...</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">
                  {liveDone} من {liveTotal} ملف مكتمل
                  {stats?.knowledgeGraph.communities ? ` · ${stats.knowledgeGraph.communities} مجتمع معرفي` : ""}
                </span>
                <span className="font-bold text-primary">{liveProgress}%</span>
              </div>
              <Progress value={liveProgress} className="h-3" />
            </div>

            {/* KG quick stats */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xl font-bold text-primary">{stats?.knowledgeGraph.nodes ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">عقدة</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xl font-bold text-accent">{stats?.knowledgeGraph.edges ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">علاقة</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xl font-bold text-purple-400">{stats?.knowledgeGraph.communities ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">مجتمع</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              {!autoIndexing ? (
                <Button
                  onClick={startAutoIndex}
                  variant="hero"
                  className="gap-2"
                  disabled={liveProgress === 100 && (stats?.knowledgeGraph.communities ?? 0) > 0}
                >
                  <Zap className="w-4 h-4" />
                  {liveProgress === 100 ? "الفهرسة مكتملة ✓" : "فهرسة تلقائية كاملة"}
                </Button>
              ) : (
                <Button onClick={stopAutoIndex} variant="destructive" className="gap-2">
                  <StopCircle className="w-4 h-4" />
                  إيقاف
                </Button>
              )}
            </div>

            {/* Auto-index log */}
            {autoIndexLog.length > 0 && (
              <div className="bg-muted/20 rounded-lg p-3 max-h-48 overflow-y-auto border border-border/30">
                <p className="text-xs font-medium text-muted-foreground mb-2">سجل العمليات:</p>
                <div className="space-y-1">
                  {autoIndexLog.map((entry, i) => (
                    <p key={i} className="text-xs font-mono text-foreground/80 leading-relaxed">{entry}</p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ===== SUBSCRIPTIONS BREAKDOWN ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card/80 backdrop-blur-xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                توزيع الاشتراكات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(stats?.subscriptions.breakdown ?? {}).map(([status, count]) => {
                const labels: Record<string, string> = {
                  active: "نشط", trialing: "تجريبي", cancelled: "ملغى",
                  expired: "منتهي", none: "بلا اشتراك",
                };
                const total = stats?.subscriptions.total || 1;
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{labels[status] || status}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                    <Progress value={(count / total) * 100} className="h-1.5" />
                  </div>
                );
              })}
              {(!stats?.subscriptions.breakdown || Object.keys(stats.subscriptions.breakdown).length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات</p>
              )}
            </CardContent>
          </Card>

          {/* KG Files Status */}
          <Card className="bg-card/80 backdrop-blur-xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                حالة ملفات الفهرسة ({kgTotalFiles} ملف)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {kgTotalFiles === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">لا توجد ملفات مفهرسة بعد</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {stats?.knowledgeGraph.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge
                          variant="outline"
                          className={`text-xs shrink-0 flex items-center gap-1 ${statusColors[file.status] || statusColors.pending}`}
                        >
                          {statusIcons[file.status]}
                          {file.status}
                        </Badge>
                        <span className="text-muted-foreground shrink-0 font-mono">{file.sbc_source}</span>
                        <span className="truncate text-foreground/80">{file.file_name.replace("_chunks.json", "")}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-muted-foreground ms-2">
                        <span className="text-primary">{file.nodes_extracted ?? 0}n</span>
                        <span className="text-accent">{file.edges_extracted ?? 0}e</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ===== MANUAL INDEXER CONTROL ===== */}
        <Card className="bg-card/80 backdrop-blur-xl border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4 text-muted-foreground" />
              تحكم يدوي في الفهرسة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex gap-2">
                {(["index", "communities", "reset"] as const).map((action) => {
                  const labels = { index: "فهرسة ملف واحد", communities: "بناء المجتمعات", reset: "مسح الكل" };
                  return (
                    <Button
                      key={action}
                      variant={indexerAction === action ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIndexerAction(action)}
                      className={action === "reset" ? "border-destructive/50 hover:bg-destructive/10" : ""}
                    >
                      {labels[action]}
                    </Button>
                  );
                })}
              </div>
              <Button
                onClick={runIndexer}
                disabled={indexing}
                variant={indexerAction === "reset" ? "destructive" : "hero"}
                size="sm"
                className="gap-2"
              >
                {indexing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ التنفيذ...</>
                ) : (
                  <><Play className="w-4 h-4" /> تشغيل</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
