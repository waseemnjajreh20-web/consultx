import { Users } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { useOrganization } from "@/hooks/useOrganization";

type Member   = ReturnType<typeof useOrganization>["members"][number];
type Presence = ReturnType<typeof useOrganization>["presence"][number];

interface TeamPresencePanelProps {
  members:  Member[];
  presence: Presence[];
  loading:  boolean;
}

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function isOnline(lastSeen: string | undefined): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS;
}

const ROLE_SHORT: Record<string, { en: string; ar: string }> = {
  owner:              { en: "Owner",  ar: "المالك" },
  admin:              { en: "Admin",  ar: "مدير" },
  head_of_department: { en: "Head",   ar: "رئيس" },
  engineer:           { en: "Eng",    ar: "مهندس" },
  finance_officer:    { en: "Finance",ar: "مالي" },
};

export default function TeamPresencePanel({ members, presence, loading }: TeamPresencePanelProps) {
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
          {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-muted/20 rounded animate-pulse" />)}
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
            const roleShort = ROLE_SHORT[m.role] ?? { en: m.role, ar: m.role };
            return (
              <div key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/10 transition-colors">
                <span className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-green-400" : "bg-muted-foreground/30"}`} />
                <span className="text-xs font-mono text-foreground/70 truncate flex-1">
                  …{m.user_id.slice(-8)}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">{ar ? roleShort.ar : roleShort.en}</span>
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
