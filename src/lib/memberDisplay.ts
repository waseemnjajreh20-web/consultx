// E7.8: pure helpers that resolve a member row into a human-friendly display.
//
// Priority for display name:
//   1. org_member_profiles.display_name_override   (per-org override)
//   2. user_public_profiles.display_name           (user's own preferred name)
//   3. truncated UUID                              (last 8 of user_id, prefixed by ellipsis)
//
// Priority for role title (in the requested language):
//   1. org_member_profiles.role_title_{ar|en}      (per-org override)
//   2. user_public_profiles.job_title              (general job title)
//   3. null                                         (UI falls back to base-role badge)
//
// Avatar comes from user_public_profiles.avatar_url; when absent, callers
// render initials derived from the resolved display name.

export type Language = "ar" | "en";

export interface OrgMemberProfileRow {
  member_id: string;
  display_name_override: string | null;
  role_title_ar: string | null;
  role_title_en: string | null;
  department: string | null;
  phone_ext: string | null;
  notes: string | null;
}

export interface UserPublicProfileRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  phone: string | null;
  bio: string | null;
  preferred_language: Language;
}

export interface ResolvedDisplay {
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  roleTitle: string | null;
  department: string | null;
  baseRole: string;
}

const nonEmpty = (s: string | null | undefined): string | null => {
  if (!s) return null;
  const trimmed = s.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const truncatedUid = (userId: string): string => {
  const tail = userId.replace(/-/g, "").slice(-8);
  return `…${tail}`;
};

export function initialsFromName(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  // Split on whitespace; for single-token names (common in Arabic), take the
  // first two unicode code points instead. This keeps Arabic avatars readable.
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    return (firstCodePoint(tokens[0]) + firstCodePoint(tokens[1])).toUpperCase();
  }
  // Single token — use first two code points.
  const cps = Array.from(cleaned);
  return (cps[0] + (cps[1] ?? "")).toUpperCase();
}

function firstCodePoint(s: string): string {
  return Array.from(s)[0] ?? "";
}

export function resolveMemberDisplay(args: {
  member: { id: string; user_id: string; role: string };
  orgProfile?: OrgMemberProfileRow | null;
  userProfile?: UserPublicProfileRow | null;
  language: Language;
}): ResolvedDisplay {
  const { member, orgProfile, userProfile, language } = args;

  const displayName =
    nonEmpty(orgProfile?.display_name_override) ??
    nonEmpty(userProfile?.display_name) ??
    truncatedUid(member.user_id);

  const roleTitle =
    (language === "ar"
      ? nonEmpty(orgProfile?.role_title_ar) ?? nonEmpty(orgProfile?.role_title_en)
      : nonEmpty(orgProfile?.role_title_en) ?? nonEmpty(orgProfile?.role_title_ar)) ??
    nonEmpty(userProfile?.job_title);

  return {
    displayName,
    initials: initialsFromName(displayName),
    avatarUrl: nonEmpty(userProfile?.avatar_url),
    roleTitle,
    department: nonEmpty(orgProfile?.department),
    baseRole: member.role,
  };
}

// Convenience for callers that have only a user_id and a user-public-profile
// row (e.g., message author rendering). Returns the same shape but with no
// org-scoped overrides applied and a placeholder base role.
export function resolveUserDisplay(args: {
  userId: string;
  userProfile?: UserPublicProfileRow | null;
}): ResolvedDisplay {
  const { userId, userProfile } = args;
  const displayName = nonEmpty(userProfile?.display_name) ?? truncatedUid(userId);
  return {
    displayName,
    initials: initialsFromName(displayName),
    avatarUrl: nonEmpty(userProfile?.avatar_url),
    roleTitle: nonEmpty(userProfile?.job_title),
    department: null,
    baseRole: "",
  };
}
