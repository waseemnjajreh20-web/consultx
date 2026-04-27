/**
 * E7.10C — Compact assignment badge for case rows / cards.
 *
 * Renders the assigned engineer and head reviewer on a case row. Resolves
 * names through useOrganization.resolveDisplay so member-profile overrides
 * (E7.8) are respected. Shows a clear "unassigned" hint when either FK is
 * null so managers see the gap at a glance.
 */

import { useMemo } from "react";
import { ShieldAlert, ShieldCheck, UserSquare2 } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";

interface Props {
  assignedEngineerId: string | null;
  headReviewerId: string | null;
  ar: boolean;
  showHints?: boolean;
}

export default function CaseResponsibilityBadge({
  assignedEngineerId, headReviewerId, ar, showHints = false,
}: Props) {
  const { members, resolveDisplay } = useOrganization();

  const engineerLabel = useMemo(() => {
    if (!assignedEngineerId) return null;
    const m = members.find((x) => x.user_id === assignedEngineerId);
    if (!m) return null;
    return resolveDisplay({ id: m.id, user_id: m.user_id, role: m.role }).displayName;
  }, [assignedEngineerId, members, resolveDisplay]);

  const headLabel = useMemo(() => {
    if (!headReviewerId) return null;
    const m = members.find((x) => x.user_id === headReviewerId);
    if (!m) return null;
    return resolveDisplay({ id: m.id, user_id: m.user_id, role: m.role }).displayName;
  }, [headReviewerId, members, resolveDisplay]);

  const missingEngineer = !assignedEngineerId;
  const missingHead = !headReviewerId;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {/* Engineer */}
      {engineerLabel ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
          <UserSquare2 className="w-3 h-3" />
          {engineerLabel}
        </span>
      ) : showHints ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200">
          <UserSquare2 className="w-3 h-3" />
          {ar ? "بدون مهندس" : "No engineer"}
        </span>
      ) : null}

      {/* Head reviewer */}
      {headLabel ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
          <ShieldCheck className="w-3 h-3" />
          {headLabel}
        </span>
      ) : showHints ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-200">
          <ShieldAlert className="w-3 h-3" />
          {ar ? "بدون رئيس قسم" : "No head reviewer"}
        </span>
      ) : null}

      {/* Compact "fully unassigned" pill when no individual badges show */}
      {!engineerLabel && !headLabel && !showHints && (missingEngineer || missingHead) && (
        <span className="text-muted-foreground">{ar ? "—" : "—"}</span>
      )}
    </div>
  );
}
