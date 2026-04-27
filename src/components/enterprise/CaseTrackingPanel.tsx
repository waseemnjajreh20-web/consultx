/**
 * E7.10A — Composite tracking panel rendered inside CaseDetailDrawer.
 *
 * Wires together:
 *   - QR code + copy / preview / regenerate
 *   - Visibility toggles (public_enabled, show_engineer_contact, show_progress_percent)
 *   - Client contact form
 *   - Published updates timeline
 *   - Publish-update dialog launcher
 *
 * Loads its own data via react-query (does not extend useOrganization for
 * E7.10A — keeps the new surface self-contained).
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, Megaphone, ShieldOff, User2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getPublicStatusInfo } from "@/lib/enterprise/casePublicMapping";

import CaseQRCodeCard from "@/components/enterprise/CaseQRCodeCard";
import ClientContactPanel, {
  type CaseClientContactRow,
} from "@/components/enterprise/ClientContactPanel";
import PublishCaseUpdateDialog from "@/components/enterprise/PublishCaseUpdateDialog";

type Tracking = {
  case_id: string;
  org_id: string;
  public_token: string;
  public_enabled: boolean;
  public_title: string | null;
  public_summary: string | null;
  show_engineer_contact: boolean;
  show_progress_percent: boolean;
  last_published_at: string | null;
};

type PublicUpdate = {
  id: string;
  title_ar: string;
  title_en: string | null;
  body_ar: string | null;
  body_en: string | null;
  public_status: string;
  progress_percent: number;
  client_action_required: boolean;
  required_action_ar: string | null;
  required_action_en: string | null;
  published_at: string;
  notify_client: boolean;
  notification_status: string;
};

interface Props {
  caseId: string;
  caseStatus: string;
  caseNumber: string;
  orgRole?: string | null;
  ar: boolean;
}

export default function CaseTrackingPanel({ caseId, caseStatus, caseNumber, orgRole, ar }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [publishOpen, setPublishOpen] = useState(false);

  const isOwnerOrAdmin = orgRole === "owner" || orgRole === "admin";
  const canChangeSettings = isOwnerOrAdmin || orgRole === "head_of_department";
  const canPublish =
    isOwnerOrAdmin || orgRole === "head_of_department" || orgRole === "engineer";

  // ── 1. Tracking row (lazily ensured on mount) ────────────────────────────
  const trackingQuery = useQuery<Tracking | null>({
    queryKey: ["case_public_tracking", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_public_tracking")
        .select("*")
        .eq("case_id", caseId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Tracking | null;
    },
    staleTime: 30 * 1000,
  });

  // Lazily call ensure_case_public_tracking once if no row exists yet.
  const ensureMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("ensure_case_public_tracking", {
        p_case_id: caseId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_public_tracking", caseId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "تعذّر إنشاء التتبع" : "Could not enable tracking", description: msg, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (trackingQuery.data === null && !trackingQuery.isLoading && !ensureMutation.isPending) {
      ensureMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingQuery.data, trackingQuery.isLoading]);

  // ── 2. Client contact ────────────────────────────────────────────────────
  const contactQuery = useQuery<CaseClientContactRow | null>({
    queryKey: ["case_client_contacts", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_client_contacts")
        .select("id, case_id, client_name, phone_e164, email, preferred_channel, receive_updates")
        .eq("case_id", caseId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CaseClientContactRow | null;
    },
    staleTime: 60 * 1000,
  });

  // ── 3. Published updates ─────────────────────────────────────────────────
  const updatesQuery = useQuery<PublicUpdate[]>({
    queryKey: ["case_public_updates", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_public_updates")
        .select("*")
        .eq("case_id", caseId)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PublicUpdate[];
    },
    staleTime: 60 * 1000,
  });

  // ── 4. Settings mutation ─────────────────────────────────────────────────
  const updateSettings = useMutation({
    mutationFn: async (patch: Partial<Pick<Tracking, "public_enabled" | "show_engineer_contact" | "show_progress_percent">>) => {
      const { error } = await supabase.rpc("update_case_public_tracking_settings", {
        p_case_id: caseId,
        p_public_enabled: patch.public_enabled ?? null,
        p_public_title: null,
        p_public_summary: null,
        p_show_engineer_contact: patch.show_engineer_contact ?? null,
        p_show_progress_percent: patch.show_progress_percent ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_public_tracking", caseId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    },
  });

  // ── 5. Token rotation ────────────────────────────────────────────────────
  const regenerateToken = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("regenerate_case_public_token", {
        p_case_id: caseId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_public_tracking", caseId] });
      toast({ title: ar ? "تم إنشاء رمز جديد" : "New token issued" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    },
  });

  const tracking = trackingQuery.data ?? null;
  const updates = updatesQuery.data ?? [];

  if (orgRole === "finance_officer") {
    return (
      <div className="rounded-lg border border-border/30 bg-muted/10 p-4 text-sm text-muted-foreground">
        {ar ? "هذه الخصائص غير متاحة للمالية." : "This view is not available for finance officers."}
      </div>
    );
  }

  if (trackingQuery.isLoading || ensureMutation.isPending || !tracking) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {ar ? "جارٍ تجهيز التتبع…" : "Preparing tracking…"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CaseQRCodeCard
        token={tracking.public_token}
        caseNumber={caseNumber}
        publicEnabled={tracking.public_enabled}
        canRegenerate={isOwnerOrAdmin}
        onRegenerate={() => regenerateToken.mutate()}
        ar={ar}
      />

      {/* Visibility toggles */}
      <div className="rounded-lg border border-border/40 bg-card/40 p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          {tracking.public_enabled ? <Eye className="w-4 h-4 text-muted-foreground" /> : <ShieldOff className="w-4 h-4 text-red-400" />}
          {ar ? "إعدادات العرض العام" : "Public visibility"}
        </p>
        <ToggleRow
          label={ar ? "تفعيل التتبع العام" : "Tracking enabled"}
          description={ar ? "إذا تم إيقافه يصبح الرابط غير متاح." : "Disabling makes the link return Not found."}
          checked={tracking.public_enabled}
          disabled={!canChangeSettings || updateSettings.isPending}
          onCheckedChange={(v) => updateSettings.mutate({ public_enabled: v })}
        />
        <ToggleRow
          label={ar ? "عرض النسبة المئوية للتقدم" : "Show progress percent"}
          description={ar ? "أرقام النسبة تظهر على صفحة التتبع." : "Hide if you'd rather not show numeric progress."}
          checked={tracking.show_progress_percent}
          disabled={!canChangeSettings || updateSettings.isPending}
          onCheckedChange={(v) => updateSettings.mutate({ show_progress_percent: v })}
        />
        <ToggleRow
          label={ar ? "عرض اسم المهندس المسؤول" : "Show assigned engineer"}
          description={ar ? "يظهر اسم المهندس فقط — لا تظهر بيانات الاتصال." : "Shows the engineer's name only — no contact details."}
          checked={tracking.show_engineer_contact}
          disabled={!canChangeSettings || updateSettings.isPending}
          onCheckedChange={(v) => updateSettings.mutate({ show_engineer_contact: v })}
          icon={<User2 className="w-3.5 h-3.5 text-muted-foreground" />}
        />
      </div>

      {/* Client contact */}
      <ClientContactPanel
        caseId={caseId}
        initial={contactQuery.data ?? null}
        ar={ar}
      />

      {/* Publish + recent updates */}
      <div className="rounded-lg border border-border/40 bg-card/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-muted-foreground" />
            {ar ? "التحديثات المنشورة" : "Published updates"}
          </p>
          {canPublish && (
            <Button size="sm" className="gap-1.5" onClick={() => setPublishOpen(true)}>
              <Megaphone className="w-3.5 h-3.5" />
              {ar ? "نشر تحديث" : "Publish update"}
            </Button>
          )}
        </div>

        {updatesQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {ar ? "جارٍ التحميل…" : "Loading…"}
          </div>
        ) : updates.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            {ar ? "لم يُنشر أي تحديث بعد." : "No updates published yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {updates.map((u) => {
              const info = getPublicStatusInfo(u.public_status);
              const ts = new Date(u.published_at).toLocaleString(ar ? "ar-SA" : "en-US");
              return (
                <div key={u.id} className="rounded-md border border-border/30 bg-muted/10 px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-border/40 bg-muted/40">
                      {ar ? info.ar : info.en}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {u.progress_percent}%
                    </span>
                    {u.client_action_required && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
                        {ar ? "إجراء مطلوب" : "Action required"}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/60 ms-auto">{ts}</span>
                  </div>
                  <p className="text-sm font-medium">{ar ? u.title_ar : (u.title_en || u.title_ar)}</p>
                  {(ar ? u.body_ar : (u.body_en || u.body_ar)) && (
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
                      {ar ? u.body_ar : (u.body_en || u.body_ar)}
                    </p>
                  )}
                  {u.notify_client && (
                    <p className="text-[10px] text-muted-foreground/70">
                      {ar ? "حالة الإشعار:" : "Notification:"} {u.notification_status}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {publishOpen && (
        <PublishCaseUpdateDialog
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          caseId={caseId}
          caseStatus={caseStatus}
          ar={ar}
        />
      )}
    </div>
  );
}

function ToggleRow({
  label, description, checked, disabled, onCheckedChange, icon,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (v: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer">
      <div className="min-w-0">
        <p className="text-xs font-medium flex items-center gap-1.5">
          {icon}{label}
        </p>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </label>
  );
}
