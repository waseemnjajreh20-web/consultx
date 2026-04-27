import { Users } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { useOrganization } from "@/hooks/useOrganization";
import type { ResolvedDisplay } from "@/lib/memberDisplay";
import MemberAvatar from "@/components/MemberAvatar";

type Member   = ReturnType<typeof useOrganization>["members"][number];
type Presence = ReturnType<typeof useOrganization>["presence"][number];

interface TeamPresencePanelProps {
  members:  Member[];
  presence: Presence[];
  loading:  boolean;
  resolveDisplay: (m: Member) => ResolvedDisplay;
}

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function isOnline(lastSeen: string | undefined): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS;
}

const ROLE_SHORT: Record<string, { en: string; ar: string }> = {
  owner:              { en: "Owner",   ar: "المالك" },
  admin:              { en: "Admin",   ar: "مدير" },
  head_of_department: { en: "Head",    ar: "رئيس" },
  engineer:           { en: "Eng",     ar: "مهندس" },
  finance_officer:    { en: "Finance", ar: "مالي" },
};

export default function TeamPresencePanel({ members, presence, loading, resolveDisplay }: TeamPresencePanelProps) {
  const { language } = useLanguage();
  const ar = language === "ar";

  const presenceMap = new Map(presence.map((p) => [p.user_id, p.last_seen_at]));

  const sorted = [...members].sort((a, b) => {
    const aOnline = isOnline(presenceMap.get(a.user_id) ?? undefined) ? 0 : 1;
    const bOnline = isOnline(presenceMap.get(b.user_id) ?? undefined) ? 0 : 1;
    return aOnline - bOnline;
  });

  const onlineCount = sorted.filter((m) => isOnline(presenceMap.get(m.user_id) ?? undefined)).length;

  return (
    <div className="bg-card/60 rounded-xl border border-border/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">{ar ? "الفريق" : "Team"}</p>
        {!loading && (
          <span className="ms-auto text-xs text-muted-foreground">
            <span className="text-green-400 font-medium">{onlineCount}</span>
            {" / "}
            {members.length}
            {" "}
            {ar ? "نشط" : "online"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted/20 rounded animate-pulse" />)}
        </div>
      ) : members.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          {ar ? "لا يوجد أعضاء بعد" : "No members yet"}
        </p>
      ) : (
        <div className="space-y-1">
          {sorted.map((m) => {
            const lastSeen = presenceMap.get(m.user_id) ?? undefined;
            const online = isOnline(lastSeen);
            const display = resolveDisplay(m);
            const roleShort = ROLE_SHORT[m.role] ?? { en: m.role, ar: m.role };
            const secondary =
              display.roleTitle ??
              (ar ? roleShort.ar : roleShort.en);

            return (
              <div
                key={m.id}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/10 transition-colors"
              >
                <div className="relative shrink-0">
                  <MemberAvatar
                    src={display.avatarUrl}
                    initials={display.initials}
                    size="sm"
                    alt={display.displayName}
                  />
                  <span
                    className={`absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card ${online ? "bg-green-400" : "bg-muted-foreground/40"}`}
                    aria-hidden
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground/90 truncate">
                    {display.displayName}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {secondary}
                    {display.department && (
                      <span className="text-muted-foreground/60"> · {display.department}</span>
                    )}
                  </p>
                </div>
                {!online && lastSeen && (
                  <span className="text-[10px] text-muted-foreground/50 shrink-0 hidden sm:inline">
                    {formatRelative(lastSeen, ar)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatRelative(ts: string, ar: boolean): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60)  return ar ? `${diffMin}د` : `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)    return ar ? `${diffH}س` : `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return ar ? `${diffD}ي` : `${diffD}d`;
}
