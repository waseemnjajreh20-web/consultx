/**
 * AdminUserManagement
 *
 * Super-admin UI for viewing and managing user accounts.
 * All mutations go through the `admin-manage-user` edge function,
 * which enforces server-side authorization. Nothing sensitive is
 * decided client-side.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Users, Search, UserPlus, Ban, CheckCircle, Clock,
  RefreshCw, Loader2, ChevronDown, ShieldCheck, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  user_id: string;
  plan_type: string;
  trial_end: string | null;
  launch_trial_status: string | null;
  launch_trial_end: string | null;
  role: string;
}

interface UserSubscription {
  id: string;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
}

interface UserRecord {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  profile: UserProfile | null;
  subscription: UserSubscription | null;
}

interface Props {
  accessToken: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  free: "مجاني",
  engineer: "مهندس",
  enterprise: "مؤسسي",
};

const SUB_STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  trialing: "تجريبي",
  cancelled: "ملغى",
  expired: "منتهي",
  pending_activation: "معلق",
  past_due: "متأخر",
  suspended: "موقوف",
};

const ROLE_LABELS: Record<string, string> = {
  user: "مستخدم",
  admin: "مدير",
  super_admin: "مدير أعلى",
};

const planColor: Record<string, string> = {
  free: "border-muted/50 text-muted-foreground",
  engineer: "border-accent/40 text-accent",
  enterprise: "border-primary/40 text-primary",
};

const subColor: Record<string, string> = {
  active: "border-green-500/40 text-green-400",
  trialing: "border-accent/40 text-accent",
  cancelled: "border-muted/40 text-muted-foreground",
  expired: "border-muted/40 text-muted-foreground",
  pending_activation: "border-yellow-500/40 text-yellow-400",
  past_due: "border-red-500/40 text-red-400",
  suspended: "border-red-500/40 text-red-400",
};

const roleColor: Record<string, string> = {
  user: "",
  admin: "border-blue-500/40 text-blue-400",
  super_admin: "border-primary/40 text-primary",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-SA", { month: "short", day: "numeric", year: "2-digit" });
}

function isTrialActive(profile: UserProfile | null): boolean {
  if (!profile) return false;
  const end = profile.launch_trial_end || profile.trial_end;
  return profile.launch_trial_status === "trial_active" && !!end && new Date(end) > new Date();
}

function isBanned(u: UserRecord): boolean {
  return !!u.banned_until && new Date(u.banned_until) > new Date();
}

// ── Component ────────────────────────────────────────────────────────────────

export function AdminUserManagement({ accessToken }: Props) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePlan, setInvitePlan] = useState("free");

  // ── API helper ──────────────────────────────────────────────────────────────
  const invoke = useCallback(
    async (action: string, target_user_id?: string, payload?: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action, target_user_id, payload },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    [accessToken]
  );

  // ── Load users ──────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke("list_users");
      setUsers(data.users ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطأ غير معروف";
      toast({ title: "خطأ في تحميل المستخدمين", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [invoke, toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Generic action runner ────────────────────────────────────────────────────
  const act = useCallback(
    async (
      userId: string,
      action: string,
      payload: Record<string, unknown>,
      successMsg: string
    ) => {
      const key = userId + ":" + action;
      setActionLoading(key);
      try {
        await invoke(action, userId, payload);
        toast({ title: successMsg });
        await loadUsers();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ غير معروف";
        toast({ title: "خطأ", description: msg, variant: "destructive" });
      } finally {
        setActionLoading(null);
      }
    },
    [invoke, loadUsers, toast]
  );

  const isBusy = (userId: string, action: string) => actionLoading === userId + ":" + action;
  const anyBusy = actionLoading !== null;

  // ── Invite ──────────────────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setActionLoading("invite");
    try {
      await invoke("invite_user", undefined, {
        email: inviteEmail.trim().toLowerCase(),
        plan_type: invitePlan,
      });
      toast({ title: `تمت دعوة ${inviteEmail.trim()} بنجاح` });
      setInviteEmail("");
      setInviteOpen(false);
      await loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطأ غير معروف";
      toast({ title: "خطأ في الدعوة", description: msg, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="ابحث بالبريد الإلكتروني..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9 text-sm h-9"
            dir="ltr"
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {filtered.length} / {users.length} مستخدم
        </span>
        <Button variant="ghost" size="sm" onClick={loadUsers} disabled={loading} className="shrink-0">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button
          variant="hero"
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => setInviteOpen(true)}
        >
          <UserPlus className="w-4 h-4" />
          دعوة مستخدم
        </Button>
      </div>

      {/* User list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Users className="w-8 h-8 opacity-40" />
          <p className="text-sm">{search ? "لا نتائج للبحث" : "لا يوجد مستخدمون"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
            const banned = isBanned(u);
            const trialOn = isTrialActive(u.profile);
            const trialEnd = u.profile?.launch_trial_end ?? u.profile?.trial_end;

            return (
              <Card
                key={u.id}
                className={`bg-card/60 backdrop-blur-xl border-border/40 transition-colors ${
                  banned ? "border-red-500/30 bg-red-500/5" : ""
                }`}
              >
                <CardContent className="p-4 space-y-3">

                  {/* Row 1: email + status badges */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Role icon */}
                      {u.profile?.role === "super_admin" && (
                        <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                      {u.profile?.role === "admin" && (
                        <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate" dir="ltr">{u.email}</span>
                      {banned && (
                        <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs shrink-0">
                          محظور
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                      {u.profile?.role && u.profile.role !== "user" && (
                        <Badge variant="outline" className={`text-xs ${roleColor[u.profile.role] ?? ""}`}>
                          {ROLE_LABELS[u.profile.role] ?? u.profile.role}
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-xs ${planColor[u.profile?.plan_type ?? "free"] ?? ""}`}>
                        {PLAN_LABELS[u.profile?.plan_type ?? "free"] ?? u.profile?.plan_type}
                      </Badge>
                      {u.subscription && (
                        <Badge variant="outline" className={`text-xs ${subColor[u.subscription.status] ?? ""}`}>
                          {SUB_STATUS_LABELS[u.subscription.status] ?? u.subscription.status}
                        </Badge>
                      )}
                      {trialOn && (
                        <Badge variant="outline" className="text-xs border-primary/40 text-primary flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          تجريبي نشط
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Row 2: action controls */}
                  <div className="flex items-center gap-2 flex-wrap">

                    {/* Plan selector */}
                    <Select
                      value={u.profile?.plan_type ?? "free"}
                      onValueChange={(v) =>
                        act(u.id, "set_plan", { plan_type: v }, `تم تغيير الباقة إلى: ${PLAN_LABELS[v] ?? v}`)
                      }
                      disabled={anyBusy}
                    >
                      <SelectTrigger className="h-7 text-xs w-28 gap-1">
                        <SelectValue />
                        <ChevronDown className="w-3 h-3 opacity-50" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">مجاني</SelectItem>
                        <SelectItem value="engineer">مهندس</SelectItem>
                        <SelectItem value="enterprise">مؤسسي</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Role selector */}
                    <Select
                      value={u.profile?.role ?? "user"}
                      onValueChange={(v) =>
                        act(u.id, "set_role", { role: v }, `تم تغيير الصلاحية إلى: ${ROLE_LABELS[v] ?? v}`)
                      }
                      disabled={anyBusy || u.profile?.role === "super_admin"}
                    >
                      <SelectTrigger className="h-7 text-xs w-28 gap-1">
                        <SelectValue />
                        <ChevronDown className="w-3 h-3 opacity-50" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">مستخدم</SelectItem>
                        <SelectItem value="admin">مدير</SelectItem>
                        <SelectItem value="super_admin">مدير أعلى</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Subscription status selector (only if sub exists) */}
                    {u.subscription && (
                      <Select
                        value={u.subscription.status}
                        onValueChange={(v) =>
                          act(u.id, "set_subscription_status", { status: v }, `تم تغيير الاشتراك إلى: ${SUB_STATUS_LABELS[v] ?? v}`)
                        }
                        disabled={anyBusy}
                      >
                        <SelectTrigger className="h-7 text-xs w-28 gap-1">
                          <SelectValue />
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">نشط</SelectItem>
                          <SelectItem value="trialing">تجريبي</SelectItem>
                          <SelectItem value="cancelled">ملغى</SelectItem>
                          <SelectItem value="expired">منتهي</SelectItem>
                          <SelectItem value="suspended">موقوف</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {/* Trial controls */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      disabled={anyBusy}
                      title="بدء تجربة 7 أيام"
                      onClick={() =>
                        act(u.id, "start_trial", { days: 7 }, "✅ تم بدء التجربة المجانية (7 أيام)")
                      }
                    >
                      {isBusy(u.id, "start_trial")
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : "▶ 7أيام"}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      disabled={anyBusy}
                      title="تمديد التجربة 7 أيام إضافية"
                      onClick={() =>
                        act(u.id, "extend_trial", { days: 7 }, "✅ تم تمديد التجربة 7 أيام")
                      }
                    >
                      {isBusy(u.id, "extend_trial")
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : "+7"}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                      disabled={anyBusy}
                      title="إنهاء التجربة فوراً"
                      onClick={() =>
                        act(u.id, "expire_trial", {}, "⏹ تم إنهاء التجربة")
                      }
                    >
                      {isBusy(u.id, "expire_trial")
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : "⏹ إنهاء"}
                    </Button>

                    {/* Disable / Enable */}
                    <div className="ms-auto">
                      {banned ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2 border-green-500/30 text-green-400 hover:bg-green-500/10"
                          disabled={anyBusy}
                          onClick={() =>
                            act(u.id, "enable_account", {}, "✅ تم إعادة تفعيل الحساب")
                          }
                        >
                          {isBusy(u.id, "enable_account")
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <><CheckCircle className="w-3 h-3 me-1" />تفعيل</>}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                          disabled={anyBusy || u.profile?.role === "super_admin"}
                          onClick={() =>
                            act(u.id, "disable_account", {}, "🚫 تم تعطيل الحساب")
                          }
                        >
                          {isBusy(u.id, "disable_account")
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <><Ban className="w-3 h-3 me-1" />تعطيل</>}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Row 3: metadata */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground/60" dir="ltr">
                    <span>Created {fmtDate(u.created_at)}</span>
                    {u.last_sign_in_at && <span>Last seen {fmtDate(u.last_sign_in_at)}</span>}
                    {trialOn && trialEnd && (
                      <span className="text-primary">
                        Trial ends {fmtDate(trialEnd)}
                      </span>
                    )}
                    {u.subscription?.current_period_end && (
                      <span>Sub ends {fmtDate(u.subscription.current_period_end)}</span>
                    )}
                    <span className="font-mono opacity-50">{u.id.slice(0, 8)}</span>
                  </div>

                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Invite Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="w-4 h-4" />
              دعوة مستخدم جديد
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">البريد الإلكتروني</label>
              <Input
                placeholder="user@example.com"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                dir="ltr"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">الباقة الابتدائية</label>
              <Select value={invitePlan} onValueChange={setInvitePlan}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">مجاني</SelectItem>
                  <SelectItem value="engineer">مهندس</SelectItem>
                  <SelectItem value="enterprise">مؤسسي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setInviteOpen(false); setInviteEmail(""); }}
            >
              إلغاء
            </Button>
            <Button
              variant="hero"
              size="sm"
              onClick={handleInvite}
              disabled={!inviteEmail.trim() || actionLoading === "invite"}
              className="gap-2"
            >
              {actionLoading === "invite"
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><UserPlus className="w-4 h-4" />إرسال الدعوة</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
