/**
 * EnterpriseWorkspace — full institutional workspace page (route: /enterprise).
 *
 * E7.5: this is the real product surface for organizations — not a Sheet.
 * Sections (Tabs):
 *   1. Dashboard            (لوحة القيادة)
 *   2. Cases                (المعاملات)
 *   3. Members & Roles      (الأعضاء والصلاحيات)
 *   4. Invitations          (الدعوات)
 *   5. Reports & Approvals  (التقارير والاعتمادات)
 *   6. Organization Settings(إعدادات المؤسسة)
 *
 * Reads only from existing useOrganization / useEntitlement; only writes via
 * existing live RPCs (`create_organization_with_owner`, `create_enterprise_case`)
 * and the existing `org_invitations` insert. No DB migration. No billing.
 */
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ClipboardList,
  Copy,
  Crown,
  ExternalLink,
  FileSignature,
  FlaskConical,
  Hourglass,
  Layers,
  Mail,
  Palette,
  Plus,
  Settings,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useEntitlement } from "@/hooks/useEntitlement";
import { useOrganization } from "@/hooks/useOrganization";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";

import CaseList from "@/components/enterprise/CaseList";
import CreateCaseModal from "@/components/enterprise/CreateCaseModal";
import CreateOrganizationCard from "@/components/enterprise/CreateOrganizationCard";
import InviteMemberForm from "@/components/enterprise/InviteMemberForm";
import MemberList from "@/components/enterprise/MemberList";
import OrgCard from "@/components/enterprise/OrgCard";

// ── Static copy (kept in-page so a translator can scan one file) ────────────
const ROLE_LABEL: Record<string, { ar: string; en: string }> = {
  owner:              { ar: "المالك",       en: "Owner" },
  admin:              { ar: "مدير",         en: "Admin" },
  head_of_department: { ar: "رئيس قسم",    en: "Head of Department" },
  engineer:           { ar: "مهندس",         en: "Engineer" },
  finance_officer:    { ar: "مسؤول مالي",   en: "Finance Officer" },
};

const PERMISSION_SUMMARY: Array<{ role: string; ar: string; en: string }> = [
  { role: "owner",              ar: "صلاحيات كاملة على المؤسسة والأعضاء والمعاملات", en: "Full control over org, members, cases" },
  { role: "admin",              ar: "إدارة المؤسسة والمعاملات، بدون اعتماد فني",      en: "Manage org & cases, no technical approval" },
  { role: "head_of_department", ar: "مراجعة واعتماد المعاملات الفنية",               en: "Technical review & approvals" },
  { role: "engineer",           ar: "إنشاء ومراجعة فنية للمعاملات",                  en: "Create & technically review cases" },
  { role: "finance_officer",    ar: "فوترة فقط، بدون مساحة عمل فنية",                en: "Billing only, no technical workspace" },
];

const STATUS_LABEL: Record<string, { ar: string; en: string; cls: string }> = {
  draft:                    { ar: "مسودة",                en: "Draft",                cls: "bg-muted/40 text-muted-foreground border-border/40" },
  submitted:                { ar: "مُقدَّمة",              en: "Submitted",            cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  assigned:                 { ar: "موكَلة",               en: "Assigned",             cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  under_engineering_review: { ar: "قيد المراجعة الهندسية", en: "Under engineering review", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  ai_review_attached:       { ar: "مراجعة ذكية مرفقة",     en: "AI review attached",   cls: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  engineer_review_completed:{ ar: "اكتملت المراجعة الهندسية", en: "Engineer review completed", cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  submitted_to_head:        { ar: "مرفوعة لرئيس القسم",    en: "Submitted to head",    cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  returned_for_revision:    { ar: "مُعادة للتعديل",         en: "Returned for revision", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  approved_internal:        { ar: "اعتماد داخلي",          en: "Approved (internal)",  cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  delivered_to_client:      { ar: "مُسلَّمة للعميل",         en: "Delivered to client",   cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  closed:                   { ar: "مغلقة",                en: "Closed",               cls: "bg-muted/40 text-muted-foreground border-border/40" },
  cancelled:                { ar: "ملغاة",                en: "Cancelled",            cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  open:                     { ar: "مفتوحة",               en: "Open",                 cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  in_review:                { ar: "قيد المراجعة",           en: "In review",            cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  approved:                 { ar: "معتمدة",               en: "Approved",             cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  rejected:                 { ar: "مرفوضة",               en: "Rejected",             cls: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const ACTIVE_CASE_STATUSES = new Set([
  "draft", "submitted", "assigned",
  "under_engineering_review", "ai_review_attached",
  "engineer_review_completed", "submitted_to_head",
  "returned_for_revision",
  "open", "in_review",
]);

type WorkspaceTab = "dashboard" | "cases" | "members" | "invitations" | "reports" | "settings";

// ════════════════════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════════════════════

export default function EnterpriseWorkspace() {
  const { language } = useLanguage();
  const ar = language === "ar";
  const navigate = useNavigate();
  const { toast } = useToast();

  const {
    isAdmin,
    isOwnerMode,
    adminOverrideMode,
    effectiveAccess,
    effectivePlanSlug,
    effectiveAccessSource,
    user,
    authLoading,
  } = useEntitlement();

  const {
    org,
    orgRole,
    orgLoading,
    members,
    membersLoading,
    invitations,
    invitationsLoading,
    cases,
    casesLoading,
    isOwnerOrAdmin,
    isFinanceOfficer,
    hasOrganization,
    canManageMembers,
    canCreateCase,
    canCreateOrganization,
    createOrganization,
    inviteMember,
    createCase,
  } = useOrganization();

  const [tab, setTab]                 = useState<WorkspaceTab>("dashboard");
  const [showInviteForm, setShowInvite] = useState(false);
  const [showCreateCase, setShowCase]   = useState(false);
  // E7.5: post-bootstrap success panel.
  const [bootstrapSuccess, setBootstrapSuccess] = useState(false);

  const isOverrideActive = effectiveAccessSource === "admin_override";
  const roleLabel        = orgRole ? ROLE_LABEL[orgRole] ?? { ar: orgRole, en: orgRole } : null;

  // Reset success panel if the user navigates away from the org or signs out.
  useEffect(() => {
    if (!hasOrganization) setBootstrapSuccess(false);
  }, [hasOrganization]);

  // Auth guard — push to /auth if signed out.
  if (!authLoading && !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-3 max-w-sm">
          <Building2 className="w-8 h-8 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">{ar ? "يلزم تسجيل الدخول" : "Sign-in required"}</h2>
          <p className="text-sm text-muted-foreground">
            {ar ? "سجّل الدخول لفتح مساحة العمل المؤسسية." : "Sign in to open the enterprise workspace."}
          </p>
          <Button onClick={() => navigate("/auth")}>{ar ? "تسجيل الدخول" : "Sign in"}</Button>
        </div>
      </div>
    );
  }

  // Derived stats
  const memberCount        = members.length;
  const pendingInviteCount = invitations.length;
  const activeCaseCount    = cases.filter((c) => ACTIVE_CASE_STATUSES.has(c.status)).length;
  const casesByStatus      = cases.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  const latestCases = cases.slice(0, 5);

  // ── Header ───────────────────────────────────────────────────────────────
  const Header = (
    <header
      className="border-b border-white/10 bg-[rgba(10,14,20,0.92)] backdrop-blur-xl sticky top-0 z-20"
      dir={ar ? "rtl" : "ltr"}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/workspace")}
          aria-label={ar ? "رجوع" : "Back"}
          className="text-muted-foreground hover:text-foreground"
        >
          {ar ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
        </Button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Building2 className="w-5 h-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-semibold truncate leading-tight">
              {hasOrganization && org?.name
                ? org.name
                : (ar ? "مساحة العمل المؤسسية" : "Enterprise Workspace")}
            </h1>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {ar ? "البيانات هنا حقيقية داخل قاعدة البيانات؛ وضع الاختبار لا يغيّر الفوترة."
                  : "Data here is real in the database; admin test mode does not change billing."}
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-1.5 text-[11px]">
          {roleLabel && (
            <Chip icon={<Users className="w-3 h-3" />}>
              <strong>{ar ? roleLabel.ar : roleLabel.en}</strong>
            </Chip>
          )}
          <Chip icon={<Layers className="w-3 h-3" />}>
            {ar ? "الباقة" : "Plan"}: <strong className="ms-1">{effectivePlanSlug || "—"}</strong>
          </Chip>
          <Chip icon={<Sparkles className="w-3 h-3" />}>
            {ar ? "الوصول" : "Access"}: <strong className="ms-1">{effectiveAccess || "—"}</strong>
          </Chip>
        </div>
      </div>

      {isOverrideActive && (
        <div className="bg-amber-500/8 border-t border-amber-500/25">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[11px] leading-relaxed text-amber-200/90">
              <strong className="font-semibold">
                {ar ? "وضع اختبار الأدمن مفعّل" : "Admin test override active"}
                {adminOverrideMode ? ` — ${adminOverrideMode}` : ""}
              </strong>
              <span className="opacity-80 ms-2">
                {ar
                  ? "وضع الاختبار لا يغيّر الفوترة، لكن إنشاء المؤسسة والمعاملات بيانات حقيقية في قاعدة البيانات."
                  : "Test mode does not change billing, but org and case creation persist as real data."}
              </span>
            </p>
          </div>
        </div>
      )}
    </header>
  );

  // ── Bootstrap state (no org yet) ─────────────────────────────────────────
  if (!orgLoading && !hasOrganization) {
    return (
      <div className="min-h-dvh bg-background" dir={ar ? "rtl" : "ltr"}>
        {Header}
        <main className="max-w-2xl mx-auto px-4 md:px-6 py-8 space-y-5">
          {bootstrapSuccess && hasOrganization ? null : (
            canCreateOrganization ? (
              <CreateOrganizationCard
                createOrgMutation={createOrganization}
                isOwnerOverride={isOverrideActive || isOwnerMode}
              />
            ) : (
              <div className="rounded-xl border border-border/40 bg-card/40 p-6 text-sm text-muted-foreground leading-relaxed">
                {ar
                  ? "لا توجد مؤسسة مرتبطة بحسابك، ولا يمكنك إنشاء واحدة من هنا. تواصل مع الإدارة."
                  : "No organization is linked to your account and creation is not available here. Contact admin."}
              </div>
            )
          )}

          <div className="rounded-xl border border-border/40 bg-card/30 p-4 text-xs text-muted-foreground">
            {ar
              ? "بعد إنشاء المؤسسة ستفتح مساحة العمل تلقائيًا مع تبويبات: لوحة القيادة، المعاملات، الأعضاء، الدعوات، التقارير، الإعدادات."
              : "After creation, the workspace opens automatically with tabs: Dashboard, Cases, Members, Invitations, Reports, Settings."}
          </div>
        </main>
      </div>
    );
  }

  // ── Detect freshly-created org (transition into success panel) ──────────
  if (hasOrganization && createOrganization.isSuccess && !bootstrapSuccess) {
    // Latch once.
    setTimeout(() => setBootstrapSuccess(true), 0);
  }

  // ── Loading shell ────────────────────────────────────────────────────────
  if (orgLoading) {
    return (
      <div className="min-h-dvh bg-background" dir={ar ? "rtl" : "ltr"}>
        {Header}
        <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/20 animate-pulse" />
          ))}
        </main>
      </div>
    );
  }

  // ── Workspace ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-background" dir={ar ? "rtl" : "ltr"}>
      {Header}

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-5 space-y-5">
        {/* Bootstrap success ribbon — shown briefly after org creation. */}
        {bootstrapSuccess && (
          <div
            className="rounded-xl p-4 space-y-3"
            style={{
              background: "linear-gradient(180deg, rgba(34,197,94,0.10) 0%, rgba(34,197,94,0.02) 100%)",
              border: "1px solid rgba(34,197,94,0.30)",
            }}
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{ar ? "تم تفعيل مساحة العمل المؤسسية" : "Enterprise workspace activated"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ar
                    ? `أنت الآن مالك «${org?.name ?? ""}». ابدأ بدعوة عضو أو إنشاء أول معاملة.`
                    : `You are now the owner of "${org?.name ?? ""}". Start by inviting a member or creating your first case.`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => { setTab("invitations"); setShowInvite(true); setBootstrapSuccess(false); }}>
                <UserPlus className="w-3.5 h-3.5 me-1.5" />
                {ar ? "دعوة أول عضو" : "Invite first member"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setTab("cases"); setShowCase(true); setBootstrapSuccess(false); }}>
                <Plus className="w-3.5 h-3.5 me-1.5" />
                {ar ? "إنشاء أول معاملة" : "Create first case"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBootstrapSuccess(false)}>
                {ar ? "فتح لوحة المؤسسة" : "Open dashboard"}
              </Button>
            </div>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as WorkspaceTab)} dir={ar ? "rtl" : "ltr"}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-card/40 p-1">
            <TabsTrigger value="dashboard" className="text-xs gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> {ar ? "لوحة القيادة" : "Dashboard"}
            </TabsTrigger>
            <TabsTrigger value="cases" className="text-xs gap-1.5">
              <Briefcase className="w-3.5 h-3.5" /> {ar ? "المعاملات" : "Cases"}
            </TabsTrigger>
            <TabsTrigger value="members" className="text-xs gap-1.5">
              <Users className="w-3.5 h-3.5" /> {ar ? "الأعضاء والصلاحيات" : "Members & Roles"}
            </TabsTrigger>
            <TabsTrigger value="invitations" className="text-xs gap-1.5">
              <Mail className="w-3.5 h-3.5" /> {ar ? "الدعوات" : "Invitations"}
            </TabsTrigger>
            <TabsTrigger value="reports" className="text-xs gap-1.5">
              <FileSignature className="w-3.5 h-3.5" /> {ar ? "التقارير والاعتمادات" : "Reports & Approvals"}
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs gap-1.5">
              <Settings className="w-3.5 h-3.5" /> {ar ? "إعدادات المؤسسة" : "Settings"}
            </TabsTrigger>
          </TabsList>

          {/* ── Dashboard ───────────────────────────────────────────────── */}
          <TabsContent value="dashboard" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon={<Users className="w-4 h-4" />}
                label={ar ? "الأعضاء" : "Members"}
                value={memberCount}
                loading={membersLoading}
                cta={memberCount === 0 && canManageMembers ? {
                  label: ar ? "دعوة عضو" : "Invite",
                  onClick: () => { setTab("invitations"); setShowInvite(true); },
                } : undefined}
              />
              <StatCard
                icon={<Mail className="w-4 h-4" />}
                label={ar ? "دعوات معلّقة" : "Pending invites"}
                value={pendingInviteCount}
                loading={invitationsLoading}
                muted={!canManageMembers}
              />
              <StatCard
                icon={<Briefcase className="w-4 h-4" />}
                label={ar ? "معاملات نشطة" : "Active cases"}
                value={activeCaseCount}
                loading={casesLoading}
                muted={isFinanceOfficer}
                cta={activeCaseCount === 0 && canCreateCase ? {
                  label: ar ? "إنشاء معاملة" : "New case",
                  onClick: () => { setTab("cases"); setShowCase(true); },
                } : undefined}
              />
              <StatCard
                icon={<Hourglass className="w-4 h-4" />}
                label={ar ? "إجمالي المعاملات" : "Total cases"}
                value={cases.length}
                loading={casesLoading}
                muted={isFinanceOfficer}
              />
            </div>

            {!isFinanceOfficer && Object.keys(casesByStatus).length > 0 && (
              <div className="rounded-xl border border-border/40 bg-card/40 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {ar ? "المعاملات حسب الحالة" : "Cases by status"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(casesByStatus).map(([status, count]) => {
                    const lbl = STATUS_LABEL[status] ?? { ar: status, en: status, cls: "bg-muted/40 text-muted-foreground border-border/40" };
                    return (
                      <span key={status}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${lbl.cls}`}>
                        {ar ? lbl.ar : lbl.en}: <strong className="ms-1">{count}</strong>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Latest cases preview */}
            {!isFinanceOfficer && (
              <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    {ar ? "أحدث المعاملات" : "Latest cases"}
                  </p>
                  {canCreateCase && (
                    <Button size="sm" variant="outline" onClick={() => { setTab("cases"); setShowCase(true); }}>
                      <Plus className="w-3.5 h-3.5 me-1.5" />
                      {ar ? "إنشاء معاملة" : "New case"}
                    </Button>
                  )}
                </div>
                {casesLoading ? (
                  <div className="space-y-1.5">
                    {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded bg-muted/20 animate-pulse" />)}
                  </div>
                ) : latestCases.length === 0 ? (
                  <div className="text-center py-6 space-y-2">
                    <p className="text-xs text-muted-foreground">{ar ? "لا توجد معاملات بعد" : "No cases yet"}</p>
                    {canCreateCase && (
                      <Button size="sm" onClick={() => { setTab("cases"); setShowCase(true); }}>
                        <Plus className="w-3.5 h-3.5 me-1.5" />
                        {ar ? "إنشاء أول معاملة" : "Create first case"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {latestCases.map((c) => {
                      const lbl = STATUS_LABEL[c.status] ?? { ar: c.status, en: c.status, cls: "bg-muted/40 text-muted-foreground border-border/40" };
                      return (
                        <button
                          key={c.id}
                          onClick={() => setTab("cases")}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors text-start"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{c.title}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {c.case_number}{c.client_name ? ` · ${c.client_name}` : ""}
                            </p>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${lbl.cls}`}>
                            {ar ? lbl.ar : lbl.en}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Quick actions */}
            <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-3">
              <p className="text-sm font-semibold">{ar ? "إجراءات سريعة" : "Quick actions"}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Button size="sm" variant="outline" disabled={!canCreateCase}
                        onClick={() => { setTab("cases"); setShowCase(true); }}
                        className="justify-start gap-2">
                  <Plus className="w-3.5 h-3.5" /> {ar ? "إنشاء معاملة" : "New case"}
                </Button>
                <Button size="sm" variant="outline" disabled={!canManageMembers}
                        onClick={() => { setTab("invitations"); setShowInvite(true); }}
                        className="justify-start gap-2">
                  <UserPlus className="w-3.5 h-3.5" /> {ar ? "دعوة عضو" : "Invite member"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTab("settings")}
                        className="justify-start gap-2">
                  <Settings className="w-3.5 h-3.5" /> {ar ? "إعدادات المؤسسة" : "Settings"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTab("reports")}
                        className="justify-start gap-2">
                  <FileSignature className="w-3.5 h-3.5" /> {ar ? "التقارير والاعتمادات" : "Reports"}
                </Button>
              </div>
            </div>

            {/* Owner-mode side card */}
            {isOwnerMode && (
              <div
                className="rounded-xl p-4 space-y-2"
                style={{
                  background: "rgba(255,140,0,0.06)",
                  border: "1px solid rgba(255,140,0,0.25)",
                }}
              >
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <p className="text-sm font-semibold text-amber-300">
                    {ar ? "صلاحيات المالك مفعّلة" : "Owner privileges active"}
                  </p>
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 ms-auto">
                    <FlaskConical className="w-3 h-3 me-1" />
                    {ar ? "وضع اختبار" : "Test mode"}
                  </Badge>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-200/80">
                  {ar
                    ? "وضع الاختبار لا يغيّر الفوترة، لكن إنشاء المؤسسة والمعاملات بيانات حقيقية."
                    : "Test mode does not change billing, but org and case creation persist as real data."}
                </p>
              </div>
            )}
          </TabsContent>

          {/* ── Cases ────────────────────────────────────────────────────── */}
          <TabsContent value="cases" className="space-y-3 mt-4">
            {isFinanceOfficer ? (
              <DisabledSection
                ar={ar}
                title={ar ? "غير متاح للمالي" : "Not available for finance officers"}
                desc={ar ? "دور «المسؤول المالي» مخصص للفوترة فقط." : "The finance officer role is billing-only."}
              />
            ) : (
              <CaseList
                cases={cases}
                loading={casesLoading}
                isOwnerOrAdmin={canCreateCase}
                onCreateClick={() => setShowCase(true)}
              />
            )}
          </TabsContent>

          {/* ── Members & Roles ─────────────────────────────────────────── */}
          <TabsContent value="members" className="space-y-3 mt-4">
            <MemberList
              members={members}
              loading={membersLoading}
              isOwnerOrAdmin={canManageMembers}
              onInviteClick={() => { setTab("invitations"); setShowInvite(true); }}
            />

            <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                {ar ? "الأدوار والصلاحيات" : "Roles & permissions"}
              </p>
              {PERMISSION_SUMMARY.map((p) => {
                const isCurrent = orgRole === p.role;
                return (
                  <div key={p.role}
                       className={`flex items-start gap-3 px-3 py-2 rounded-lg ${isCurrent ? "bg-primary/5 border border-primary/20" : "bg-muted/10 border border-transparent"}`}>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {ar ? ROLE_LABEL[p.role].ar : ROLE_LABEL[p.role].en}
                    </Badge>
                    <p className="text-xs text-muted-foreground flex-1 leading-relaxed">{ar ? p.ar : p.en}</p>
                    {isCurrent && (
                      <span className="text-[10px] font-semibold text-primary shrink-0">
                        {ar ? "دورك الحالي" : "Your role"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Disabled member ops — be explicit, do not hide deferral. */}
            <div className="rounded-xl border border-dashed border-border/40 bg-muted/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {ar ? "إدارة الأعضاء — قريبًا" : "Member management — coming next"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button size="sm" variant="outline" disabled className="justify-start gap-2 opacity-60">
                  <Users className="w-3.5 h-3.5" /> {ar ? "تغيير دور" : "Change role"}
                </Button>
                <Button size="sm" variant="outline" disabled className="justify-start gap-2 opacity-60">
                  <Users className="w-3.5 h-3.5" /> {ar ? "إيقاف عضو" : "Suspend member"}
                </Button>
                <Button size="sm" variant="outline" disabled className="justify-start gap-2 opacity-60">
                  <Users className="w-3.5 h-3.5" /> {ar ? "حذف عضو" : "Remove member"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/80">
                {ar
                  ? "هذه العمليات تتطلب RPCs مخصصة لم تُربط بعد."
                  : "These actions require dedicated RPCs that are not yet wired."}
              </p>
            </div>
          </TabsContent>

          {/* ── Invitations ─────────────────────────────────────────────── */}
          <TabsContent value="invitations" className="space-y-3 mt-4">
            {!canManageMembers ? (
              <DisabledSection
                ar={ar}
                title={ar ? "للمالك / المدير فقط" : "Owner / admin only"}
                desc={ar ? "لا يمكنك إدارة الدعوات بدورك الحالي." : "Your role cannot manage invitations."}
              />
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Mail className="w-4 h-4 text-primary" />
                    {ar ? "الدعوات المعلّقة" : "Pending invitations"}
                    <span className="text-xs text-muted-foreground font-normal">
                      ({invitationsLoading ? "…" : invitations.length})
                    </span>
                  </p>
                  <Button size="sm" onClick={() => setShowInvite(true)}>
                    <UserPlus className="w-3.5 h-3.5 me-1.5" />
                    {ar ? "دعوة عضو" : "Invite member"}
                  </Button>
                </div>

                {showInviteForm && (
                  <InviteMemberForm
                    inviteMutation={inviteMember}
                    onClose={() => setShowInvite(false)}
                  />
                )}

                {invitationsLoading ? (
                  <div className="h-16 rounded bg-muted/20 animate-pulse" />
                ) : invitations.length === 0 ? (
                  <div className="rounded-xl border border-border/40 bg-card/40 p-6 text-center text-sm text-muted-foreground">
                    {ar ? "لا توجد دعوات معلّقة" : "No pending invitations"}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {invitations.map((inv) => (
                      <InvitationRow key={inv.id} inv={inv} ar={ar} toast={toast} />
                    ))}
                  </div>
                )}

                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-[11px] text-amber-200/90 leading-relaxed flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                  <span>
                    {ar
                      ? "قبول الدعوة التلقائي قادم؛ حاليًا انسخ الرابط من الدعوة وأرسله يدويًا. إرسال الدعوات بالبريد قريبًا أيضًا."
                      : "Automatic invitation acceptance is coming; for now copy the link and share manually. Email delivery is also coming next."}
                  </span>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Reports & Approvals ─────────────────────────────────────── */}
          <TabsContent value="reports" className="space-y-3 mt-4">
            <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-primary" />
                {ar ? "التقارير والاعتمادات" : "Reports & Approvals"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {ar
                  ? "قيد الربط مع المعاملات. سير العمل المخطط: مراجعة المهندس → ربط الأدلة الذكية → اعتماد رئيس القسم → التسليم للعميل."
                  : "Wiring in progress. Planned flow: engineer review → AI evidence binding → head approval → client delivery."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <PipelineStep ar={ar} icon={<ClipboardList className="w-3.5 h-3.5" />} label={ar ? "مراجعة المهندس" : "Engineer review"} />
                <PipelineStep ar={ar} icon={<Sparkles className="w-3.5 h-3.5" />} label={ar ? "ربط الأدلة الذكية" : "AI evidence"} />
                <PipelineStep ar={ar} icon={<CheckCircle2 className="w-3.5 h-3.5" />} label={ar ? "اعتماد رئيس القسم" : "Head approval"} />
              </div>
              <p className="text-[10px] text-muted-foreground/80">
                {ar
                  ? "الجداول case_reviews / case_approvals / ai_report_versions / case_review_ai_reports موجودة بالفعل، لكن واجهة الاستخدام لم تُربط بعد."
                  : "Tables case_reviews / case_approvals / ai_report_versions / case_review_ai_reports already exist; the UI binding is not yet wired."}
              </p>
            </div>
          </TabsContent>

          {/* ── Settings ────────────────────────────────────────────────── */}
          <TabsContent value="settings" className="space-y-3 mt-4">
            {org && <OrgCard org={org} orgRole={orgRole ?? "engineer"} />}

            {/* Available org metadata is shown by OrgCard. Surface deferred branding clearly. */}
            <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Palette className="w-4 h-4 text-primary" />
                {ar ? "الهوية البصرية للمؤسسة" : "Brand identity"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {ar
                  ? "تخصيص الشعار، ترويسة التقارير، الألوان، نمط التقرير الافتراضي — قيد التطوير."
                  : "Custom logo, report letterhead, colors, default report style — coming next."}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <DisabledTile ar={ar} arText="الشعار" enText="Logo" />
                <DisabledTile ar={ar} arText="ترويسة التقارير" enText="Report letterhead" />
                <DisabledTile ar={ar} arText="ألوان الهوية" enText="Brand colors" />
                <DisabledTile ar={ar} arText="نمط التقرير" enText="Report style" />
              </div>
            </div>

            <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" />
                {ar ? "الفوترة المؤسسية" : "Enterprise billing"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {ar
                  ? "فوترة المقاعد للمؤسسة قيد التطوير. الفوترة الحالية فردية على مستوى الحساب."
                  : "Per-seat enterprise billing is coming next. Current billing remains per-user."}
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link to="/account">
                  <ExternalLink className="w-3.5 h-3.5 me-1.5" />
                  {ar ? "فتح الحساب" : "Open account"}
                </Link>
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Modals */}
      <CreateCaseModal
        open={showCreateCase}
        onClose={() => setShowCase(false)}
        createCaseMutation={createCase}
      />
    </div>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────────

function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-white/10 bg-white/5 text-white/80">
      {icon}
      <span>{children}</span>
    </span>
  );
}

function StatCard({
  icon, label, value, loading, muted, cta,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading?: boolean;
  muted?: boolean;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div className={`rounded-xl border p-3 ${muted ? "border-border/30 bg-muted/10 opacity-60" : "border-border/40 bg-card/50"}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="text-xl font-semibold tabular-nums mb-1.5">
        {loading ? <span className="inline-block w-6 h-5 bg-muted/40 rounded animate-pulse" /> : value}
      </p>
      {cta && (
        <Button size="sm" variant="outline" className="h-7 text-[11px] w-full" onClick={cta.onClick}>
          {cta.label}
        </Button>
      )}
    </div>
  );
}

function DisabledSection({ ar, title, desc }: { ar: boolean; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-6 text-center space-y-1.5">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function PipelineStep({ ar, icon, label }: { ar: boolean; icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/40 bg-muted/5 p-3 flex items-center gap-2 opacity-70">
      <span className="text-primary">{icon}</span>
      <span className="text-xs">{label}</span>
      <Badge variant="outline" className="ms-auto text-[9px] border-dashed">
        {ar ? "قريبًا" : "soon"}
      </Badge>
    </div>
  );
}

function DisabledTile({ ar, arText, enText }: { ar: boolean; arText: string; enText: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/40 bg-muted/5 p-3 opacity-70">
      <p className="text-xs font-medium">{ar ? arText : enText}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{ar ? "قريبًا" : "coming next"}</p>
    </div>
  );
}

// Inline invitation row — copy-link card.
type Invitation = { id: string; email: string; role: string; token: string; status: string; created_at: string };

function InvitationRow({ inv, ar, toast }: { inv: Invitation; ar: boolean; toast: ReturnType<typeof useToast>["toast"] }) {
  const link = `${window.location.origin}/accept-invite?token=${inv.token}`;
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: ar ? "تم نسخ الرابط" : "Link copied" });
    } catch {
      toast({ title: ar ? "تعذّر النسخ" : "Copy failed", variant: "destructive" });
    }
  };
  const roleLabel = ROLE_LABEL[inv.role]?.[ar ? "ar" : "en"] ?? inv.role;
  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{inv.email}</p>
          <p className="text-[10px] text-muted-foreground">
            {roleLabel} · {new Date(inv.created_at).toLocaleDateString(ar ? "ar-SA" : "en-US")}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 shrink-0">
          {ar ? "قيد الانتظار" : "Pending"}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-[10px] font-mono bg-background/40 border border-border/40 rounded px-2 py-1 truncate">
          {link}
        </code>
        <Button size="sm" variant="outline" onClick={handleCopy} className="h-7 text-[11px] gap-1">
          <Copy className="w-3 h-3" />
          {copied ? (ar ? "تم" : "Copied") : (ar ? "نسخ" : "Copy")}
        </Button>
      </div>
    </div>
  );
}
