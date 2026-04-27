import { useState } from "react";
import { UserPlus, ChevronDown, Shield, UserMinus, UserCheck, AlertTriangle, IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import type { useOrganization } from "@/hooks/useOrganization";
import type { OrgMemberProfileRow, ResolvedDisplay } from "@/lib/memberDisplay";
import MemberAvatar from "@/components/MemberAvatar";
import EditMemberProfileDialog from "@/components/enterprise/EditMemberProfileDialog";

type Member = ReturnType<typeof useOrganization>["members"][number];
type UpdateRoleMutation = ReturnType<typeof useOrganization>["updateMemberRole"];
type UpdateStatusMutation = ReturnType<typeof useOrganization>["updateMemberStatus"];
type UpsertOrgMemberProfileMutation = ReturnType<typeof useOrganization>["upsertOrgMemberProfile"];

interface MemberListProps {
  members: Member[];
  loading: boolean;
  isOwnerOrAdmin: boolean;
  currentUserId?: string;
  onInviteClick: () => void;
  updateMemberRole?: UpdateRoleMutation;
  updateMemberStatus?: UpdateStatusMutation;
  upsertOrgMemberProfile?: UpsertOrgMemberProfileMutation;
  memberProfiles?: OrgMemberProfileRow[];
  resolveDisplay?: (m: Member) => ResolvedDisplay;
}

// Fallback resolver used when a parent (e.g. the Account preview) does not
// supply one. Falls back to the user-id tail with no avatar/role-title.
const fallbackResolve = (m: Member): ResolvedDisplay => {
  const tail = m.user_id.replace(/-/g, "").slice(-8);
  return {
    displayName: `…${tail}`,
    initials: tail.slice(0, 2).toUpperCase(),
    avatarUrl: null,
    roleTitle: null,
    department: null,
    baseRole: m.role,
  };
};

const ROLE_LABEL: Record<string, { en: string; ar: string; cls: string }> = {
  owner:              { en: "Owner",           ar: "المالك",      cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  admin:              { en: "Admin",           ar: "مدير",        cls: "bg-blue-500/10   text-blue-400   border-blue-500/20"   },
  head_of_department: { en: "Head of Dept",    ar: "رئيس قسم",   cls: "bg-cyan-500/10   text-cyan-400   border-cyan-500/20"   },
  engineer:           { en: "Engineer",        ar: "مهندس",       cls: "bg-green-500/10  text-green-400  border-green-500/20"  },
  finance_officer:    { en: "Finance Officer", ar: "مسؤول مالي", cls: "bg-amber-500/10  text-amber-400  border-amber-500/20"  },
};

const STATUS_LABEL: Record<string, { en: string; ar: string; cls: string }> = {
  active:    { en: "Active",    ar: "نشط",      cls: "text-green-400" },
  suspended: { en: "Suspended", ar: "موقوف",    cls: "text-amber-400" },
  removed:   { en: "Removed",   ar: "محذوف",    cls: "text-red-400"   },
};

const ASSIGNABLE_ROLES = [
  { value: "admin",              labelEn: "Admin",              labelAr: "مدير" },
  { value: "head_of_department", labelEn: "Head of Department", labelAr: "رئيس قسم" },
  { value: "engineer",           labelEn: "Engineer",           labelAr: "مهندس" },
  { value: "finance_officer",    labelEn: "Finance Officer",    labelAr: "مسؤول مالي" },
];

export default function MemberList({
  members,
  loading,
  isOwnerOrAdmin,
  currentUserId,
  onInviteClick,
  updateMemberRole,
  updateMemberStatus,
  upsertOrgMemberProfile,
  memberProfiles = [],
  resolveDisplay,
}: MemberListProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const ar = language === "ar";

  const [roleDialogMember, setRoleDialogMember] = useState<Member | null>(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [profileDialogMember, setProfileDialogMember] = useState<Member | null>(null);

  const resolve = resolveDisplay ?? fallbackResolve;
  const profilesByMember = new Map(memberProfiles.map((p) => [p.member_id, p]));

  const handleRoleChange = async () => {
    if (!roleDialogMember || !selectedRole || !updateMemberRole) return;
    try {
      await updateMemberRole.mutateAsync({ memberId: roleDialogMember.id, role: selectedRole });
      toast({ title: ar ? "تم تغيير الدور" : "Role updated" });
      setRoleDialogMember(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    }
  };

  const handleStatusChange = async (member: Member, newStatus: string) => {
    if (!updateMemberStatus) return;
    const actionAr = newStatus === "suspended" ? "إيقاف" : newStatus === "removed" ? "حذف" : "إعادة تفعيل";
    const actionEn = newStatus === "suspended" ? "suspend" : newStatus === "removed" ? "remove" : "reactivate";
    try {
      await updateMemberStatus.mutateAsync({ memberId: member.id, status: newStatus });
      toast({ title: ar ? `تم ${actionAr} العضو` : `Member ${actionEn}d` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    }
  };

  // Capability flags scoped to whether the parent supplied the mutations.
  const canMutateRole   = !!updateMemberRole;
  const canMutateStatus = !!updateMemberStatus;
  const canEditProfileBase = !!upsertOrgMemberProfile;

  return (
    <>
      <div className="bg-card/60 rounded-xl border border-border/40 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-sm">
            {ar ? "أعضاء المؤسسة" : "Organization Members"}
            {!loading && (
              <span className="ms-2 text-xs text-muted-foreground font-normal">
                ({members.length})
              </span>
            )}
          </h3>
          {isOwnerOrAdmin && (
            <Button variant="outline" size="sm" onClick={onInviteClick} className="gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              {ar ? "دعوة عضو" : "Invite Member"}
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted/30 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {ar ? "لا يوجد أعضاء بعد" : "No members yet"}
          </p>
        ) : (
          <div className="space-y-1.5">
            {members.map((m) => {
              const role = ROLE_LABEL[m.role] ?? { en: m.role, ar: m.role, cls: "bg-muted/40 text-muted-foreground border-border/40" };
              const status = STATUS_LABEL[m.status] ?? STATUS_LABEL.active;
              const isOwnerRow = m.role === "owner";
              const isSelf = m.user_id === currentUserId;
              const canActOnRole = canMutateRole && canMutateStatus && isOwnerOrAdmin && !isOwnerRow && !isSelf;
              // Profile edits are allowed for owner/admin on any non-owner row,
              // and for the row's user themselves (personal fields only).
              const canEditProfile = canEditProfileBase && ((isOwnerOrAdmin && !isOwnerRow) || isSelf);
              const joinedDate = m.joined_at
                ? new Date(m.joined_at).toLocaleDateString(ar ? "ar-SA" : "en-US", { year: "numeric", month: "short" })
                : null;

              const display = resolve(m);

              return (
                <div
                  key={m.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    m.status === "suspended" ? "bg-amber-500/5 border border-amber-500/15" :
                    m.status === "removed"   ? "bg-red-500/5 border border-red-500/15 opacity-60" :
                    "bg-muted/10 hover:bg-muted/20 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MemberAvatar
                      src={display.avatarUrl}
                      initials={display.initials}
                      size="md"
                      alt={display.displayName}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate text-foreground">
                        {display.displayName}
                        {isSelf && (
                          <span className="ms-1.5 text-[10px] text-primary font-semibold">
                            {ar ? "(أنت)" : "(you)"}
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {display.roleTitle && (
                          <p className="text-xs text-foreground/70 truncate">{display.roleTitle}</p>
                        )}
                        {display.department && (
                          <span className="text-xs text-muted-foreground truncate">
                            · {display.department}
                          </span>
                        )}
                        {joinedDate && (
                          <span className="text-[10px] text-muted-foreground/70">
                            · {ar ? `انضم ${joinedDate}` : `Joined ${joinedDate}`}
                          </span>
                        )}
                        {m.status !== "active" && (
                          <span className={`text-[10px] font-semibold ${status.cls}`}>
                            · {ar ? status.ar : status.en}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${role.cls}`}>
                      {ar ? role.ar : role.en}
                    </span>

                    {(canActOnRole || canEditProfile) ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            aria-label={ar ? "إجراءات العضو" : "Member actions"}
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={ar ? "start" : "end"} className="w-48">
                          {canEditProfile && (
                            <DropdownMenuItem
                              onClick={() => setProfileDialogMember(m)}
                              className="gap-2 text-sm"
                            >
                              <IdCard className="w-3.5 h-3.5" />
                              {ar ? "تعديل بيانات العضو" : "Edit profile"}
                            </DropdownMenuItem>
                          )}
                          {canActOnRole && (
                            <>
                              {canEditProfile && <DropdownMenuSeparator />}
                              <DropdownMenuItem
                                onClick={() => { setSelectedRole(m.role); setRoleDialogMember(m); }}
                                className="gap-2 text-sm"
                              >
                                <Shield className="w-3.5 h-3.5" />
                                {ar ? "تغيير الدور" : "Change role"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {m.status === "active" && (
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(m, "suspended")}
                                  className="gap-2 text-sm text-amber-400 focus:text-amber-400"
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                  {ar ? "إيقاف العضو" : "Suspend"}
                                </DropdownMenuItem>
                              )}
                              {m.status === "suspended" && (
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(m, "active")}
                                  className="gap-2 text-sm text-green-400 focus:text-green-400"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  {ar ? "إعادة تفعيل" : "Reactivate"}
                                </DropdownMenuItem>
                              )}
                              {m.status !== "removed" && (
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(m, "removed")}
                                  className="gap-2 text-sm text-red-400 focus:text-red-400"
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                  {ar ? "حذف العضو" : "Remove"}
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : isOwnerRow ? (
                      <span
                        className="text-[10px] text-muted-foreground/60 cursor-default"
                        title={ar ? "نقل الملكية قادم" : "Ownership transfer coming next"}
                      >
                        {ar ? "محمي" : "Protected"}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Role change dialog */}
      <Dialog open={!!roleDialogMember} onOpenChange={(open) => { if (!open) setRoleDialogMember(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{ar ? "تغيير دور العضو" : "Change member role"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {roleDialogMember?.role === "owner" && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">
                  {ar ? "لا يمكن تغيير دور المالك. نقل الملكية قادم." : "Owner role cannot be changed. Ownership transfer is coming next."}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {ar ? "العضو:" : "Member:"}{" "}
                <span className="font-medium text-foreground/80">
                  {roleDialogMember ? resolveDisplay(roleDialogMember).displayName : ""}
                </span>
              </p>
              <Select value={selectedRole} onValueChange={setSelectedRole} disabled={roleDialogMember?.role === "owner"}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={ar ? "اختر الدور" : "Select role"} />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {ar ? r.labelAr : r.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setRoleDialogMember(null)}>
                {ar ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={!selectedRole || selectedRole === roleDialogMember?.role || !!updateMemberRole?.isPending || roleDialogMember?.role === "owner"}
                onClick={handleRoleChange}
              >
                {updateMemberRole?.isPending ? (ar ? "جارٍ…" : "Saving…") : (ar ? "حفظ" : "Save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Member-profile edit dialog */}
      <EditMemberProfileDialog
        open={!!profileDialogMember}
        onClose={() => setProfileDialogMember(null)}
        member={profileDialogMember}
        existingProfile={profileDialogMember ? profilesByMember.get(profileDialogMember.id) ?? null : null}
        isAdminEdit={isOwnerOrAdmin && profileDialogMember?.user_id !== currentUserId}
        pending={!!upsertOrgMemberProfile?.isPending}
        onSubmit={async (input) => {
          if (!upsertOrgMemberProfile) return;
          await upsertOrgMemberProfile.mutateAsync(input);
        }}
      />
    </>
  );
}
