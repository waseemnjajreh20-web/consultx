/**
 * AICommandDashboard — E7.10B (Phase 1) top-level container.
 *
 * Composes three deterministic surfaces into a single tab inside the
 * EnterpriseWorkspace:
 *
 *   1. CommandKPIStrip       — 9 live KPIs computed from cases + 3 ancillary
 *                               queries (contacts coverage, AI evidence,
 *                               document coverage).
 *   2. CasePipelineBoard     — kanban-style columns by status (no DnD).
 *   3. CommandInsightCards   — 5 deterministic gap/risk cards.
 *
 * Hidden for finance_officer (matches existing tab gating in the workspace).
 * No Gemini calls in this phase — Phase 3 (E7.10D) adds AI-drafted insights.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";

import CommandKPIStrip from "@/components/enterprise/CommandKPIStrip";
import CasePipelineBoard from "@/components/enterprise/CasePipelineBoard";
import CommandInsightCards from "@/components/enterprise/CommandInsightCards";
import CaseDetailDrawer from "@/components/enterprise/CaseDetailDrawer";

type Case = ReturnType<typeof useOrganization>["cases"][number];

interface Props {
  ar: boolean;
  currentUserId: string | undefined;
}

const ACTIVE_CASE_STATUSES = new Set([
  "draft", "submitted", "assigned",
  "under_engineering_review", "ai_review_attached",
  "engineer_review_completed", "submitted_to_head",
  "returned_for_revision",
]);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const REQUIRED_DOCUMENT_CATEGORIES = new Set(["drawings", "specs"]);

export default function AICommandDashboard({ ar, currentUserId }: Props) {
  const {
    orgId,
    orgRole,
    cases,
    casesLoading,
    members,
    resolveDisplay,
    isOwnerOrAdmin,
    userProfilesForOrg,
  } = useOrganization();

  const [drawerCase, setDrawerCase] = useState<Case | null>(null);

  // ── Ancillary queries (one round trip each) ──────────────────────────────
  const contactsQuery = useQuery({
    queryKey: ["command_dashboard_contacts", orgId],
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_client_contacts")
        .select("case_id")
        .eq("org_id", orgId!);
      if (error) throw error;
      return new Set<string>((data ?? []).map((r) => r.case_id));
    },
  });

  const documentsQuery = useQuery({
    queryKey: ["command_dashboard_documents", orgId],
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_documents")
        .select("case_id, category")
        .eq("org_id", orgId!);
      if (error) throw error;
      const acc = new Map<string, Set<string>>();
      for (const row of data ?? []) {
        const set = acc.get(row.case_id) ?? new Set<string>();
        set.add(row.category as string);
        acc.set(row.case_id, set);
      }
      return acc;
    },
  });

  const acceptedAiQuery = useQuery({
    queryKey: ["command_dashboard_accepted_ai", orgId],
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_report_versions")
        .select("session_id, engineer_decision, case_ai_sessions!inner(case_id, org_id)")
        .eq("case_ai_sessions.org_id", orgId!)
        .in("engineer_decision", ["accepted", "accepted_with_notes"]);
      if (error) throw error;
      type Row = { case_ai_sessions: { case_id: string } | null };
      const accepted = new Set<string>();
      for (const row of (data ?? []) as unknown as Row[]) {
        const cid = row.case_ai_sessions?.case_id;
        if (cid) accepted.add(cid);
      }
      return accepted;
    },
  });

  // ── Derived KPIs and gap sets ────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = Date.now();
    const stuckCutoff = now - SEVEN_DAYS_MS;
    const recentDeliveryCutoff = now - THIRTY_DAYS_MS;

    let active = 0;
    let pendingEngineerReview = 0;
    let pendingHeadApproval = 0;
    let returned = 0;
    let deliveredLast30d = 0;
    let closedLifetime = 0;
    let stuck = 0;

    for (const c of cases) {
      if (ACTIVE_CASE_STATUSES.has(c.status)) active += 1;
      if (
        c.status === "submitted" ||
        c.status === "assigned" ||
        c.status === "under_engineering_review" ||
        c.status === "ai_review_attached" ||
        c.status === "returned_for_revision"
      ) {
        pendingEngineerReview += 1;
      }
      if (c.status === "submitted_to_head") pendingHeadApproval += 1;
      if (c.status === "returned_for_revision") returned += 1;
      if (c.status === "delivered_to_client" && c.delivered_at && new Date(c.delivered_at).getTime() >= recentDeliveryCutoff) {
        deliveredLast30d += 1;
      }
      if (c.status === "closed") closedLifetime += 1;
      if (
        ACTIVE_CASE_STATUSES.has(c.status) &&
        c.status !== "draft" &&
        new Date(c.updated_at).getTime() < stuckCutoff
      ) {
        stuck += 1;
      }
    }

    return {
      total: cases.length,
      active,
      pendingEngineerReview,
      pendingHeadApproval,
      returned,
      deliveredLast30d,
      closedLifetime,
      stuck,
    };
  }, [cases]);

  const caseIdsWithoutContact = useMemo(() => {
    if (!contactsQuery.data) return new Set<string>();
    const out = new Set<string>();
    for (const c of cases) {
      if (!contactsQuery.data.has(c.id)) out.add(c.id);
    }
    return out;
  }, [cases, contactsQuery.data]);

  const caseIdsWithoutAcceptedAi = useMemo(() => {
    const accepted = acceptedAiQuery.data ?? new Set<string>();
    const out = new Set<string>();
    for (const c of cases) {
      if (!accepted.has(c.id)) out.add(c.id);
    }
    return out;
  }, [cases, acceptedAiQuery.data]);

  const caseIdsMissingRequiredDocs = useMemo(() => {
    if (!documentsQuery.data) return new Set<string>();
    const out = new Set<string>();
    for (const c of cases) {
      const cats = documentsQuery.data.get(c.id);
      if (!cats || ![...cats].some((cat) => REQUIRED_DOCUMENT_CATEGORIES.has(cat))) {
        out.add(c.id);
      }
    }
    return out;
  }, [cases, documentsQuery.data]);

  const resolveEngineerName = (userId: string | null | undefined): string => {
    if (!userId) return ar ? "غير معيّن" : "Unassigned";
    const m = members.find((x) => x.user_id === userId);
    if (!m) return ar ? "عضو غير معروف" : "Unknown member";
    return resolveDisplay({ id: m.id, user_id: m.user_id, role: m.role }).displayName;
  };

  const ancillaryLoading =
    contactsQuery.isLoading || documentsQuery.isLoading || acceptedAiQuery.isLoading;
  const loading = casesLoading || ancillaryLoading;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5" dir={ar ? "rtl" : "ltr"}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {ar ? "مركز القيادة" : "Command Center"}
          </h2>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {ar
              ? "مؤشرات حقيقية مُحتسبة من بيانات قاعدة البيانات. لا توجد عمليات ذكاء اصطناعي في هذه المرحلة."
              : "Real KPIs derived from your live database. No AI calls in this phase."}
          </p>
        </div>
      </div>

      <CommandKPIStrip
        ar={ar}
        loading={loading}
        totalCases={stats.total}
        activeCases={stats.active}
        pendingEngineerReview={stats.pendingEngineerReview}
        pendingHeadApproval={stats.pendingHeadApproval}
        returnedForRevision={stats.returned}
        deliveredLast30d={stats.deliveredLast30d}
        closedLifetime={stats.closedLifetime}
        stuckOver7Days={stats.stuck}
        missingClientContact={caseIdsWithoutContact.size}
      />

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
          {ar ? "خط سير المعاملات" : "Case pipeline"}
        </p>
        <CasePipelineBoard
          cases={cases}
          loading={casesLoading}
          ar={ar}
          isOwnerOrAdmin={isOwnerOrAdmin}
          onOpenCase={(c) => setDrawerCase(c)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
          {ar ? "الإشارات والمخاطر" : "Signals & risks"}
        </p>
        <CommandInsightCards
          ar={ar}
          cases={cases}
          caseIdsWithoutContact={caseIdsWithoutContact}
          caseIdsWithoutAcceptedAi={caseIdsWithoutAcceptedAi}
          caseIdsMissingRequiredDocs={caseIdsMissingRequiredDocs}
          resolveEngineerName={resolveEngineerName}
          onOpenCase={(c) => setDrawerCase(c)}
        />
      </div>

      <CaseDetailDrawer
        open={!!drawerCase}
        onClose={() => setDrawerCase(null)}
        case_={drawerCase}
        orgId={orgId ?? ""}
        currentUserId={currentUserId}
        orgRole={orgRole}
        userProfilesForOrg={userProfilesForOrg}
      />
    </div>
  );
}
