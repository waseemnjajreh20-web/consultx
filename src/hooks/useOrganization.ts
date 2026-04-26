import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlement } from "@/hooks/useEntitlement";

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
      const token = crypto.randomUUID();
      const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("org_invitations")
        .insert({ org_id: orgId, email, role, token, expires_at, created_by: session.user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_invitations", orgId] });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_members", orgId] });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org_members", orgId] });
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
    createOrganization,
    inviteMember,
    createCase,
    revokeInvitation,
    updateMemberRole,
    updateMemberStatus,
    upsertBranding,
    refetchMembers: () => qc.invalidateQueries({ queryKey: ["org_members", orgId] }),
    refetchCases: () => qc.invalidateQueries({ queryKey: ["enterprise_cases", orgId] }),
    refetchInvitations: () => qc.invalidateQueries({ queryKey: ["org_invitations", orgId] }),
  };
}
