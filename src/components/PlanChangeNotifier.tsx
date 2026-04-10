/**
 * PlanChangeNotifier
 *
 * Detects when a super_admin has changed the current user's plan via the
 * admin-manage-user edge function and shows a one-time in-app toast.
 *
 * Mechanism:
 *   The edge function writes { new_plan, old_plan, changed_at, changed_by }
 *   to auth.users.raw_app_meta_data under the key "plan_notification".
 *   This component reads that field from the Supabase session user object
 *   (populated on every JWT refresh, which happens automatically every ~50 min)
 *   and shows a toast the first time it sees a new changed_at value.
 *
 * Deduplication:
 *   sessionStorage["plan_notif_seen:<changed_at>"] is set after showing the
 *   toast so it does not re-fire on re-renders or React StrictMode double-mounts.
 *
 * Renders null — no visible DOM output.
 */
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface PlanNotification {
  new_plan?: string;
  old_plan?: string;
  changed_at?: string;
  changed_by?: string;
}

const PLAN_LABELS: Record<string, string> = {
  free: "المجاني",
  engineer: "مهندس",
  enterprise: "مؤسسي",
};

export function PlanChangeNotifier() {
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    const notification = (user.app_metadata?.plan_notification ?? null) as PlanNotification | null;
    if (!notification?.new_plan || !notification?.changed_at) return;

    // Deduplicate: one toast per unique changed_at timestamp per browser session.
    const seenKey = `plan_notif_seen:${notification.changed_at}`;
    if (sessionStorage.getItem(seenKey)) return;
    sessionStorage.setItem(seenKey, "1");

    const planLabel = PLAN_LABELS[notification.new_plan] ?? notification.new_plan;
    toast({
      title: "تم تحديث باقتك",
      description: `تم تغيير باقتك إلى ${planLabel} بواسطة المدير.`,
    });
  }, [user, toast]);

  return null;
}
