import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlement } from "@/hooks/useEntitlement";

export function useOrganization() {
  const { orgId, orgRole, isOrgMember, session } = useEntitlement();
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

  return {
    orgId,
    orgRole,
    isOrgMember,
    isOwnerOrAdmin,
    isFinanceOfficer,
    org: orgQuery.data ?? null,
    orgLoading: orgQuery.isLoading,
    members: membersQuery.data ?? [],
    membersLoading: membersQuery.isLoading,
    invitations: invitationsQuery.data ?? [],
    invitationsLoading: invitationsQuery.isLoading,
    cases: casesQuery.data ?? [],
    casesLoading: casesQuery.isLoading,
    inviteMember,
    createCase,
    refetchMembers: () => qc.invalidateQueries({ queryKey: ["org_members", orgId] }),
    refetchCases: () => qc.invalidateQueries({ queryKey: ["enterprise_cases", orgId] }),
    refetchInvitations: () => qc.invalidateQueries({ queryKey: ["org_invitations", orgId] }),
  };
}
