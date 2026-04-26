import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlement } from "@/hooks/useEntitlement";

export function useOrganization() {
  const { orgId, orgRole, isOrgMember, session, refetch: refetchEntitlement } = useEntitlement();
  const qc = useQueryClient();

  const isOwnerOrAdmin = orgRole === "owner" || orgRole === "admin";
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
    onSuccess: () => {
      // Force the entitlement chain to re-resolve so org_access populates,
      // then invalidate org-scoped query caches.
      refetchEntitlement();
      qc.invalidateQueries();
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
    createOrganization,
    inviteMember,
    createCase,
    refetchMembers: () => qc.invalidateQueries({ queryKey: ["org_members", orgId] }),
    refetchCases: () => qc.invalidateQueries({ queryKey: ["enterprise_cases", orgId] }),
    refetchInvitations: () => qc.invalidateQueries({ queryKey: ["org_invitations", orgId] }),
  };
}
