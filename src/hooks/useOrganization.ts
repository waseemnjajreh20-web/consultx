import { useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useLanguage } from "@/hooks/useLanguage";
import {
  resolveMemberDisplay,
  type OrgMemberProfileRow,
  type UserPublicProfileRow,
  type ResolvedDisplay,
} from "@/lib/memberDisplay";

// Local interface for member rows used by the resolver factory.
type MemberLite = { id: string; user_id: string; role: string };

// E7.10C: shape of a row returned by the my-tasks query (with a join on
// enterprise_cases for case_number / title).
export type MyCaseTaskRow = {
  id: string;
  case_id: string;
  org_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  enterprise_cases: {
    case_number: string;
    title: string;
    status: string;
  } | null;
};

export function useOrganization() {
  const {
    orgId: entitlementOrgId,
    orgRole: entitlementOrgRole,
    isOrgMember,
    session,
    user,
    refetch: refetchEntitlement,
  } = useEntitlement();
  const qc = useQueryClient();
  const { language } = useLanguage();

  // E7.5: defense-in-depth membership fallback.
  // The check-subscription edge function may not be redeployed yet, or under
  // admin override may legitimately not surface org_access. Read directly
  // from org_members (RLS-respected) so the workspace works regardless.
  const membershipFallbackQuery = useQuery({
    queryKey: ["org_membership_self", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("org_members")
        .select("org_id, role, status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    // Only run the fallback when the entitlement chain hasn't told us about an org.
    enabled: !!user?.id && !entitlementOrgId,
    staleTime: 60 * 1000,
  });

  // Effective scoping — entitlement first, fallback second. Either path is
  // RLS-respected, so spoofing is not possible from the client.
  const orgId   = entitlementOrgId   ?? membershipFallbackQuery.data?.org_id ?? null;
  const orgRole = entitlementOrgRole ?? membershipFallbackQuery.data?.role   ?? null;

  const isOwnerOrAdmin   = orgRole === "owner" || orgRole === "admin";
  const isFinanceOfficer = orgRole === "finance_officer";

  const orgQuery = useQuery({
    queryKey: ["org", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const membersQuery = useQuery({
    queryKey: ["org_members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_members")
        .select("*")
        .eq("org_id", orgId!)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });

  const invitationsQuery = useQuery({
    queryKey: ["org_invitations", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_invitations")
        .select("*")
        .eq("org_id", orgId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId && isOwnerOrAdmin,
    staleTime: 2 * 60 * 1000,
  });

  const casesQuery = useQuery({
    queryKey: ["enterprise_cases", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enterprise_cases")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId && !isFinanceOfficer,
    staleTime: 60 * 1000,
  });

  // E7.4: bootstrap a fresh organization via the SECURITY DEFINER RPC.
  // Atomically inserts org + owner membership; returns new org_id.
  const createOrganization = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Organization name is required");
      const { data, error } = await supabase.rpc("create_organization_with_owner", {
        p_name: trimmed,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      // Force the entitlement chain to re-resolve so org_access populates,
      // and prime the membership fallback so the workspace hydrates even
      // before the edge function returns a fresh org_access.
      refetchEntitlement();
      await qc.invalidateQueries({ queryKey: ["org_membership_self"] });
      await qc.invalidateQueries();
    },
  });

  const inviteMember = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      if (!orgId || !session) throw new Error("Not authenticated");
      // Direct insert is no longer allowed by RLS — must go through the
      // SECURITY DEFINER RPC which validates seat limits, role, dedup, etc.
      const { data, error } = await supabase.rpc("create_org_invitation_enforced", {
        p_org_id: orgId,
        p_email:  email,
        p_role:   role,
      });
      if (error) throw error;
      // The RPC returns a single org_invitations row.
      return data as {
        id: string;
        org_id: string;
        email: string;
        role: string;
        token: string;
        status: string;
        expires_at: string;
        created_by: string;
        created_at: string;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_invitations", orgId] });
      qc.invalidateQueries({ queryKey: ["org_seat_usage", orgId] });
    },
  });

  // Seat usage — drives invite-button disable state and the "X of Y seats" copy.
  const seatUsageQuery = useQuery({
    queryKey: ["org_seat_usage", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_org_seat_usage", {
        p_org_id: orgId!,
      });
      if (error) throw new Error(error.message);
      // RPC returns a single-row table; supabase-js delivers it as an array.
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as {
        org_id: string;
        subscription_id: string | null;
        plan_slug: string | null;
        seat_count: number | null;
        min_seats: number | null;
        active_members_count: number;
        pending_invitations_count: number;
        available_seats: number | null;
        is_enforced: boolean;
      } | null;
    },
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });

  const updateSubscriptionSeatCount = useMutation({
    mutationFn: async ({ subscriptionId, seatCount }: { subscriptionId: string; seatCount: number }) => {
      const { data, error } = await supabase.rpc("update_subscription_seat_count", {
        p_subscription_id: subscriptionId,
        p_seat_count:      seatCount,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_seat_usage", orgId] });
      refetchEntitlement();
    },
  });

  const createCase = useMutation({
    mutationFn: async (args: {
      p_title: string;
      p_client_name?: string;
      p_client_ref?: string;
      p_description?: string;
    }) => {
      if (!orgId) throw new Error("No org");
      const { data, error } = await supabase.rpc("create_enterprise_case", {
        p_org_id: orgId,
        ...args,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enterprise_cases", orgId] });
    },
  });

  const revokeInvitation = useMutation({
    mutationFn: async ({ invitationId }: { invitationId: string }) => {
      const { error } = await supabase.rpc("revoke_org_invitation", {
        p_invitation_id: invitationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_invitations", orgId] });
    },
  });

  const updateMemberRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const { error } = await supabase.rpc("update_org_member_role", {
        p_member_id: memberId,
        p_role: role,
      });
      if (error) throw error;
    },
    // E7.8: when the change targets the current user, force the entitlement
    // chain to re-resolve so the sidebar/capability flags refresh immediately.
    onSuccess: async (_data, vars) => {
      const target = membersQuery.data?.find((m) => m.id === vars.memberId);
      await qc.invalidateQueries({ queryKey: ["org_members", orgId] });
      if (target?.user_id === user?.id) {
        refetchEntitlement();
      }
    },
  });

  const updateMemberStatus = useMutation({
    mutationFn: async ({ memberId, status }: { memberId: string; status: string }) => {
      const { error } = await supabase.rpc("update_org_member_status", {
        p_member_id: memberId,
        p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: async (_data, vars) => {
      const target = membersQuery.data?.find((m) => m.id === vars.memberId);
      await qc.invalidateQueries({ queryKey: ["org_members", orgId] });
      if (target?.user_id === user?.id) {
        refetchEntitlement();
      }
    },
  });

  const messagesQuery = useQuery({
    queryKey: ["org_messages", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_messages")
        .select("*")
        .eq("org_id", orgId!)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });

  const presenceQuery = useQuery({
    queryKey: ["org_presence", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_member_presence")
        .select("*")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });

  const touchPresence = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No org");
      const { error } = await supabase.rpc("touch_org_presence", { p_org_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_presence", orgId] });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async ({ body }: { body: string }) => {
      if (!orgId) throw new Error("No org");
      const { data, error } = await supabase.rpc("send_org_message", {
        p_org_id: orgId,
        p_body:   body,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_messages", orgId] });
    },
  });

  const deleteMessage = useMutation({
    mutationFn: async ({ messageId }: { messageId: string }) => {
      const { error } = await supabase.rpc("soft_delete_org_message", {
        p_message_id: messageId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_messages", orgId] });
    },
  });

  const brandingQuery = useQuery({
    queryKey: ["org_branding", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_branding_settings")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const upsertBranding = useMutation({
    mutationFn: async (args: {
      logo_url?: string | null;
      report_header_ar?: string | null;
      report_header_en?: string | null;
      primary_color?: string | null;
      secondary_color?: string | null;
      default_report_style?: string;
    }) => {
      if (!orgId) throw new Error("No org");
      const { error } = await supabase.rpc("upsert_organization_branding", {
        p_org_id: orgId,
        p_logo_url: args.logo_url ?? null,
        p_report_header_ar: args.report_header_ar ?? null,
        p_report_header_en: args.report_header_en ?? null,
        p_primary_color: args.primary_color ?? null,
        p_secondary_color: args.secondary_color ?? null,
        p_default_report_style: args.default_report_style ?? "standard",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_branding", orgId] });
    },
  });

  // ────────────────────────────────────────────────────────────────────────
  // E7.8: org_member_profiles — per-org display overrides
  // ────────────────────────────────────────────────────────────────────────
  const memberProfilesQuery = useQuery({
    queryKey: ["org_member_profiles", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_member_profiles")
        .select("*")
        .eq("org_id", orgId!);
      if (error) throw new Error(error.message);
      return (data ?? []) as OrgMemberProfileRow[];
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });

  // ────────────────────────────────────────────────────────────────────────
  // E7.8: user_public_profiles for the current org's members
  // ────────────────────────────────────────────────────────────────────────
  const memberUserIds = membersQuery.data?.map((m) => m.user_id) ?? [];
  const memberUserIdsKey = [...memberUserIds].sort().join(",");

  const userProfilesForOrgQuery = useQuery({
    queryKey: ["user_public_profiles_for_org", orgId, memberUserIdsKey],
    queryFn: async () => {
      if (memberUserIds.length === 0) return [] as UserPublicProfileRow[];
      const { data, error } = await supabase
        .from("user_public_profiles")
        .select("*")
        .in("user_id", memberUserIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as UserPublicProfileRow[];
    },
    enabled: !!orgId && memberUserIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  // ────────────────────────────────────────────────────────────────────────
  // E7.8: caller's own user_public_profiles row (for the /profile page)
  // ────────────────────────────────────────────────────────────────────────
  const myPublicProfileQuery = useQuery({
    queryKey: ["user_public_profile_self", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("user_public_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as UserPublicProfileRow | null;
    },
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
  });

  // ────────────────────────────────────────────────────────────────────────
  // E7.8: profile mutations
  // ────────────────────────────────────────────────────────────────────────
  const upsertMyPublicProfile = useMutation({
    mutationFn: async (args: {
      display_name: string | null;
      avatar_url: string | null;
      job_title: string | null;
      phone: string | null;
      bio: string | null;
      preferred_language: "ar" | "en";
    }) => {
      const { error } = await supabase.rpc("upsert_my_public_profile", {
        p_display_name:       args.display_name,
        p_avatar_url:         args.avatar_url,
        p_job_title:          args.job_title,
        p_phone:              args.phone,
        p_bio:                args.bio,
        p_preferred_language: args.preferred_language,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_public_profile_self", user?.id] });
      if (orgId) {
        qc.invalidateQueries({ queryKey: ["user_public_profiles_for_org", orgId] });
      }
    },
  });

  const upsertOrgMemberProfile = useMutation({
    mutationFn: async (args: {
      member_id: string;
      display_name_override: string | null;
      role_title_ar: string | null;
      role_title_en: string | null;
      department: string | null;
      phone_ext: string | null;
      notes: string | null;
    }) => {
      const { error } = await supabase.rpc("upsert_org_member_profile", {
        p_member_id:             args.member_id,
        p_display_name_override: args.display_name_override,
        p_role_title_ar:         args.role_title_ar,
        p_role_title_en:         args.role_title_en,
        p_department:            args.department,
        p_phone_ext:             args.phone_ext,
        p_notes:                 args.notes,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_member_profiles", orgId] });
    },
  });

  // ────────────────────────────────────────────────────────────────────────
  // E7.10C: case_tasks — user's open task list (for the dashboard widget)
  // ────────────────────────────────────────────────────────────────────────
  const myTasksQuery = useQuery({
    queryKey: ["my_case_tasks", orgId, user?.id],
    queryFn: async () => {
      if (!orgId || !user?.id) return [] as MyCaseTaskRow[];
      const { data, error } = await supabase
        .from("case_tasks")
        .select(
          "id, case_id, org_id, title, description, status, priority, due_at, completed_at, " +
          "assigned_to, created_by, created_at, " +
          "enterprise_cases!inner(case_number, title, status)",
        )
        .eq("org_id", orgId)
        .eq("assigned_to", user.id)
        .not("status", "in", "(completed,cancelled)")
        .order("priority", { ascending: false })
        .order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MyCaseTaskRow[];
    },
    enabled: !!orgId && !!user?.id && !isFinanceOfficer,
    staleTime: 60 * 1000,
  });

  // E7.10C: assign engineer / head reviewer
  const assignEnterpriseCase = useMutation({
    mutationFn: async (args: {
      case_id: string;
      assigned_engineer_id?: string | null;
      head_reviewer_id?: string | null;
      note?: string | null;
    }) => {
      const { error } = await supabase.rpc("assign_enterprise_case", {
        p_case_id: args.case_id,
        p_assigned_engineer_id: args.assigned_engineer_id ?? null,
        p_head_reviewer_id: args.head_reviewer_id ?? null,
        p_note: args.note ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enterprise_cases", orgId] });
    },
  });

  // E7.10C: task CRUD via RPCs
  const createCaseTask = useMutation({
    mutationFn: async (args: {
      case_id: string;
      title: string;
      description?: string | null;
      assigned_to?: string | null;
      priority?: string | null;
      due_at?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("create_case_task", {
        p_case_id: args.case_id,
        p_title: args.title,
        p_description: args.description ?? null,
        p_assigned_to: args.assigned_to ?? null,
        p_priority: args.priority ?? "normal",
        p_due_at: args.due_at ?? null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["case_tasks", vars.case_id] });
      qc.invalidateQueries({ queryKey: ["my_case_tasks", orgId, user?.id] });
    },
  });

  const updateCaseTask = useMutation({
    mutationFn: async (args: {
      task_id: string;
      title?: string | null;
      description?: string | null;
      assigned_to?: string | null;
      priority?: string | null;
      due_at?: string | null;
      case_id?: string;
    }) => {
      const { error } = await supabase.rpc("update_case_task", {
        p_task_id: args.task_id,
        p_title: args.title ?? null,
        p_description: args.description ?? null,
        p_assigned_to: args.assigned_to ?? null,
        p_priority: args.priority ?? null,
        p_due_at: args.due_at ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, vars) => {
      if (vars.case_id) qc.invalidateQueries({ queryKey: ["case_tasks", vars.case_id] });
      qc.invalidateQueries({ queryKey: ["my_case_tasks", orgId, user?.id] });
    },
  });

  const transitionCaseTask = useMutation({
    mutationFn: async (args: {
      task_id: string;
      to_status: string;
      note?: string | null;
      case_id?: string;
    }) => {
      const { error } = await supabase.rpc("transition_case_task", {
        p_task_id: args.task_id,
        p_to_status: args.to_status,
        p_note: args.note ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, vars) => {
      if (vars.case_id) {
        qc.invalidateQueries({ queryKey: ["case_tasks", vars.case_id] });
        qc.invalidateQueries({ queryKey: ["case_task_events", vars.case_id] });
      }
      qc.invalidateQueries({ queryKey: ["my_case_tasks", orgId, user?.id] });
    },
  });

  // ────────────────────────────────────────────────────────────────────────
  // E7.8: realtime subscriptions — push-based invalidation of the relevant
  // React Query caches whenever a postgres_changes event fires.
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`org-messages:${orgId}`)
      .on(
        // postgres_changes payload typing varies between supabase-js versions;
        // the channel is on a static publication so we don't need the typing.
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "org_messages",
          filter: `org_id=eq.${orgId}`,
        } as never,
        () => {
          qc.invalidateQueries({ queryKey: ["org_messages", orgId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`org-presence:${orgId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "org_member_presence",
          filter: `org_id=eq.${orgId}`,
        } as never,
        () => {
          qc.invalidateQueries({ queryKey: ["org_presence", orgId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`org-member-profiles:${orgId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "org_member_profiles",
          filter: `org_id=eq.${orgId}`,
        } as never,
        () => {
          qc.invalidateQueries({ queryKey: ["org_member_profiles", orgId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);

  // ────────────────────────────────────────────────────────────────────────
  // E7.8: closed-over resolver factory used by Member/Message/Presence views.
  // ────────────────────────────────────────────────────────────────────────
  const memberProfilesByMember = useMemo(() => {
    const map = new Map<string, OrgMemberProfileRow>();
    for (const p of memberProfilesQuery.data ?? []) {
      map.set(p.member_id, p);
    }
    return map;
  }, [memberProfilesQuery.data]);

  const userProfilesByUser = useMemo(() => {
    const map = new Map<string, UserPublicProfileRow>();
    for (const p of userProfilesForOrgQuery.data ?? []) {
      map.set(p.user_id, p);
    }
    return map;
  }, [userProfilesForOrgQuery.data]);

  const resolveDisplay = useCallback(
    (m: MemberLite): ResolvedDisplay =>
      resolveMemberDisplay({
        member: m,
        orgProfile: memberProfilesByMember.get(m.id),
        userProfile: userProfilesByUser.get(m.user_id),
        language: language === "ar" ? "ar" : "en",
      }),
    [memberProfilesByMember, userProfilesByUser, language],
  );

  // E7.4: composite capability flags so UI doesn't have to re-derive.
  const hasOrganization      = !!orgId;
  const canManageMembers     = hasOrganization && isOwnerOrAdmin;
  const canCreateCase        = hasOrganization && !isFinanceOfficer;
  // Any authenticated user without an existing membership row may bootstrap one.
  // The RPC enforces auth.uid() and the one-org-per-user invariant.
  const canCreateOrganization = !hasOrganization && !!session;

  return {
    orgId,
    orgRole,
    isOrgMember,
    isOwnerOrAdmin,
    isFinanceOfficer,
    hasOrganization,
    canManageMembers,
    canCreateCase,
    canCreateOrganization,
    org: orgQuery.data ?? null,
    orgLoading: orgQuery.isLoading,
    members: membersQuery.data ?? [],
    membersLoading: membersQuery.isLoading,
    invitations: invitationsQuery.data ?? [],
    invitationsLoading: invitationsQuery.isLoading,
    cases: casesQuery.data ?? [],
    casesLoading: casesQuery.isLoading,
    branding: brandingQuery.data ?? null,
    brandingLoading: brandingQuery.isLoading,
    messages: messagesQuery.data ?? [],
    messagesLoading: messagesQuery.isLoading,
    presence: presenceQuery.data ?? [],
    presenceLoading: presenceQuery.isLoading,
    // Seat enforcement
    seatUsage: seatUsageQuery.data ?? null,
    seatUsageLoading: seatUsageQuery.isLoading,
    updateSubscriptionSeatCount,
    // E7.8 outputs
    memberProfiles: memberProfilesQuery.data ?? [],
    userProfilesForOrg: userProfilesForOrgQuery.data ?? [],
    myPublicProfile: myPublicProfileQuery.data ?? null,
    myPublicProfileLoading: myPublicProfileQuery.isLoading,
    resolveDisplay,
    createOrganization,
    inviteMember,
    createCase,
    revokeInvitation,
    updateMemberRole,
    updateMemberStatus,
    upsertBranding,
    touchPresence,
    sendMessage,
    deleteMessage,
    upsertMyPublicProfile,
    upsertOrgMemberProfile,
    // E7.10C outputs
    myTasks: myTasksQuery.data ?? [],
    myTasksLoading: myTasksQuery.isLoading,
    assignEnterpriseCase,
    createCaseTask,
    updateCaseTask,
    transitionCaseTask,
    refetchMembers: () => qc.invalidateQueries({ queryKey: ["org_members", orgId] }),
    refetchCases: () => qc.invalidateQueries({ queryKey: ["enterprise_cases", orgId] }),
    refetchInvitations: () => qc.invalidateQueries({ queryKey: ["org_invitations", orgId] }),
    refetchMyPublicProfile: () => qc.invalidateQueries({ queryKey: ["user_public_profile_self", user?.id] }),
  };
}
