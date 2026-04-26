import { UserCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import type { useOrganization } from "@/hooks/useOrganization";

type Member = ReturnType<typeof useOrganization>["members"][number];

interface MemberListProps {
  members: Member[];
  loading: boolean;
  isOwnerOrAdmin: boolean;
  onInviteClick: () => void;
}

const ROLE_LABEL: Record<string, { en: string; ar: string; cls: string }> = {
  owner:              { en: "Owner",              ar: "المالك",      cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  admin:              { en: "Admin",              ar: "مدير",        cls: "bg-blue-500/10   text-blue-400   border-blue-500/20"   },
  head_of_department: { en: "Head of Dept",       ar: "رئيس قسم",   cls: "bg-cyan-500/10   text-cyan-400   border-cyan-500/20"   },
  engineer:           { en: "Engineer",           ar: "مهندس",       cls: "bg-green-500/10  text-green-400  border-green-500/20"  },
  finance_officer:    { en: "Finance Officer",    ar: "مسؤول مالي", cls: "bg-amber-500/10  text-amber-400  border-amber-500/20"  },
};

function shortUserId(uid: string) {
  return `user_…${uid.slice(-8)}`;
}

export default function MemberList({ members, loading, isOwnerOrAdmin, onInviteClick }: MemberListProps) {
  const { language } = useLanguage();

  return (
    <div className="bg-card/60 rounded-xl border border-border/40 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-sm">
          {language === "ar" ? "أعضاء المؤسسة" : "Organization Members"}
          {!loading && (
            <span className="ms-2 text-xs text-muted-foreground font-normal">
              ({members.length})
            </span>
          )}
        </h3>
        {isOwnerOrAdmin && (
          <Button variant="outline" size="sm" onClick={onInviteClick} className="gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            {language === "ar" ? "دعوة عضو" : "Invite Member"}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          {language === "ar" ? "لا يوجد أعضاء بعد" : "No members yet"}
        </p>
      ) : (
        <div className="space-y-1">
          {members.map((m) => {
            const role = ROLE_LABEL[m.role] ?? { en: m.role, ar: m.role, cls: "bg-muted/40 text-muted-foreground border-border/40" };
            const joinedDate = m.joined_at
              ? new Date(m.joined_at).toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", {
                  year: "numeric", month: "short",
                })
              : null;
            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-muted/40 flex items-center justify-center shrink-0">
                    <UserCircle className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium font-mono truncate text-foreground/80">
                      {shortUserId(m.user_id)}
                    </p>
                    {joinedDate && (
                      <p className="text-xs text-muted-foreground">
                        {language === "ar" ? `انضم: ${joinedDate}` : `Joined: ${joinedDate}`}
                      </p>
                    )}
                  </div>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${role.cls}`}>
                  {language === "ar" ? role.ar : role.en}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
