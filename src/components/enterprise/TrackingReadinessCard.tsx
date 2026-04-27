/**
 * E7.10A — Deterministic readiness card on the Enterprise dashboard.
 *
 * Shows three counters computed live from the new tracking tables:
 *   - cases without a tracking row
 *   - cases that have tracking but no published update yet
 *   - cases whose latest published update flagged client_action_required
 *
 * No AI, no derived insights — just SQL counts. Used as a teaser for
 * the future AI Command Dashboard (E7.10B).
 */

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Megaphone, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  orgId: string | null;
  totalCasesCount: number;
  ar: boolean;
}

interface Counters {
  withoutTracking: number;
  withoutAnyUpdate: number;
  awaitingClientAction: number;
}

export default function TrackingReadinessCard({ orgId, totalCasesCount, ar }: Props) {
  const { data, isLoading } = useQuery<Counters>({
    queryKey: ["tracking_readiness", orgId, totalCasesCount],
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      // Counter 1: cases that have a tracking row at all
      const { count: trackedCount } = await supabase
        .from("case_public_tracking")
        .select("case_id", { count: "exact", head: true })
        .eq("org_id", orgId!);

      // Counter 2: cases that have a tracking row AND last_published_at is null
      const { count: noUpdateCount } = await supabase
        .from("case_public_tracking")
        .select("case_id", { count: "exact", head: true })
        .eq("org_id", orgId!)
        .is("last_published_at", null);

      // Counter 3: distinct cases whose most recent update has
      // client_action_required = true. We approximate via a simple count of
      // such rows -- one update per case is the common case (since action
      // requests are typically a single open ask). For a precise "latest =
      // action_required" we'd need a window function via RPC; defer that
      // tuning until the dashboard demands it.
      const { count: actionCount } = await supabase
        .from("case_public_updates")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId!)
        .eq("client_action_required", true);

      return {
        withoutTracking: Math.max(0, totalCasesCount - (trackedCount ?? 0)),
        withoutAnyUpdate: noUpdateCount ?? 0,
        awaitingClientAction: actionCount ?? 0,
      };
    },
  });

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <QrCode className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">{ar ? "جاهزية تتبع العملاء" : "Client tracking readiness"}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Metric
          icon={<QrCode className="w-3.5 h-3.5 text-amber-400" />}
          label={ar ? "بدون تتبع عام" : "Without public tracking"}
          value={data?.withoutTracking ?? 0}
          loading={isLoading}
          tone="amber"
        />
        <Metric
          icon={<Megaphone className="w-3.5 h-3.5 text-cyan-400" />}
          label={ar ? "بدون تحديث منشور" : "No published update yet"}
          value={data?.withoutAnyUpdate ?? 0}
          loading={isLoading}
          tone="cyan"
        />
        <Metric
          icon={<AlertCircle className="w-3.5 h-3.5 text-red-400" />}
          label={ar ? "بانتظار إجراء العميل" : "Client action requested"}
          value={data?.awaitingClientAction ?? 0}
          loading={isLoading}
          tone="red"
        />
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {ar
          ? "هذه الإشارات تُحسب من بيانات قائمة فعلًا — لا يوجد تحليل AI في هذه المرحلة."
          : "Deterministic signals from existing data. AI insights arrive in E7.10B."}
      </p>
    </div>
  );
}

function Metric({
  icon, label, value, loading, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading?: boolean;
  tone: "amber" | "cyan" | "red";
}) {
  const toneCls =
    tone === "amber" ? "border-amber-500/20 bg-amber-500/5" :
    tone === "cyan"  ? "border-cyan-500/20 bg-cyan-500/5" :
                       "border-red-500/20 bg-red-500/5";
  return (
    <div className={`rounded-lg border ${toneCls} px-3 py-2.5`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-semibold mt-1 tabular-nums">
        {loading ? <span className="opacity-40">—</span> : value}
      </p>
    </div>
  );
}
