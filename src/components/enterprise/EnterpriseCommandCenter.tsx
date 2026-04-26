/**
 * EnterpriseCommandCenter — owner / admin / enterprise workspace surface.
 *
 * E7.3: A single coherent panel that aggregates the enterprise capabilities that
 * already exist (org overview, members, invitations, cases) plus an explicit
 * "Coming next" list for the deferred ones. Designed to be rendered inside a
 * Sheet from the sidebar OR inline inside the Account "organization" section.
 *
 * Strict rules:
 *   - Only reads from existing `useOrganization()` and `useEntitlement()` data.
 *   - No new backend calls, no fake data.
 *   - Role-aware visibility: finance_officer sees billing-coming-soon and org info,
 *     not the technical case workspace; engineer/head_of_department see cases;
 *     owner/admin see invite + create-case actions.
 *   - Owner Mode (admin-override) shows a clearly-marked test panel that does
 *     NOT change billing.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronRight,
  Crown,
  FlaskConical,
  Hourglass,
  Layers,
  Mail,
  Plus,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useEntitlement } from "@/hooks/useEntitlement";
import { useOrganization } from "@/hooks/useOrganization";
import { useLanguage } from "@/hooks/useLanguage";

import CaseList from "@/components/enterprise/CaseList";
import CreateCaseModal from "@/components/enterprise/CreateCaseModal";
import CreateOrganizationCard from "@/components/enterprise/CreateOrganizationCard";
import InviteMemberForm from "@/components/enterprise/InviteMemberForm";
import MemberList from "@/components/enterprise/MemberList";
import OrgCard from "@/components/enterprise/OrgCard";

// ── Static role/permission copy ─────────────────────────────────────────────
const ROLE_LABEL: Record<string, { ar: string; en: string }> = {
  owner:              { ar: "المالك",       en: "Owner" },
  admin:              { ar: "مدير",         en: "Admin" },
  head_of_department: { ar: "رئيس قسم",    en: "Head of Department" },
  engineer:           { ar: "مهندس",         en: "Engineer" },
  finance_officer:    { ar: "مسؤول مالي",   en: "Finance Officer" },
};

const PERMISSION_SUMMARY: Array<{ role: string; ar: string; en: string }> = [
  { role: "owner",              ar: "صلاحيات كاملة على المؤسسة والأعضاء والمعاملات",
                                 en: "Full control over org, members, cases" },
  { role: "admin",              ar: "إدارة المؤسسة والمعاملات، بدون اعتماد فني",
                                 en: "Manage org & cases, no technical approval" },
  { role: "head_of_department", ar: "مراجعة واعتماد المعاملات الفنية",
                                 en: "Technical review & approvals" },
  { role: "engineer",           ar: "إنشاء ومراجعة فنية للمعاملات",
                                 en: "Create & technically review cases" },
  { role: "finance_officer",    ar: "فوترة فقط، بدون مساحة عمل فنية",
                                 en: "Billing only, no technical workspace" },
];

// Truly deferred items only — the spec forbids listing capabilities that
// already work (org creation, invitation creation, case creation).
const COMING_NEXT: Array<{ ar: string; en: string }> = [
  { ar: "قبول الدعوات تلقائيًا",          en: "Automatic invitation acceptance route" },
  { ar: "إرسال الدعوات بالبريد",           en: "Email-delivered invitations" },
  { ar: "تغيير دور العضو",                  en: "Change member role" },
  { ar: "إيقاف / حذف عضو",                  en: "Suspend / remove member" },
  { ar: "رفع المستندات للمعاملات",          en: "Document upload for cases" },
  { ar: "فوترة المقاعد للمؤسسة",            en: "Per-seat enterprise billing" },
  { ar: "تخصيص الشعار والهوية البصرية",    en: "Custom logo & brand identity" },
];

// Full enterprise_cases.status enum (E3 schema).
const STATUS_LABEL: Record<string, { ar: string; en: string }> = {
  draft:                    { ar: "مسودة",                en: "Draft" },
  submitted:                { ar: "مُقدَّمة",              en: "Submitted" },
  assigned:                 { ar: "موكَلة",               en: "Assigned" },
  under_engineering_review: { ar: "قيد المراجعة الهندسية", en: "Under engineering review" },
  ai_review_attached:       { ar: "مراجعة ذكية مرفقة",     en: "AI review attached" },
  engineer_review_completed:{ ar: "اكتملت المراجعة الهندسية", en: "Engineer review completed" },
  submitted_to_head:        { ar: "مرفوعة لرئيس القسم",    en: "Submitted to head" },
  returned_for_revision:    { ar: "مُعادة للتعديل",         en: "Returned for revision" },
  approved_internal:        { ar: "اعتماد داخلي",          en: "Approved (internal)" },
  delivered_to_client:      { ar: "مُسلَّمة للعميل",         en: "Delivered to client" },
  closed:                   { ar: "مغلقة",                en: "Closed" },
  cancelled:                { ar: "ملغاة",                en: "Cancelled" },
  // Legacy fallbacks (in case any older rows linger)
  open:                     { ar: "مفتوحة",               en: "Open" },
  in_review:                { ar: "قيد المراجعة",           en: "In review" },
  approved:                 { ar: "معتمدة",               en: "Approved" },
  rejected:                 { ar: "مرفوضة",               en: "Rejected" },
};

const ACTIVE_CASE_STATUSES = new Set([
  "draft", "submitted", "assigned",
  "under_engineering_review", "ai_review_attached",
  "engineer_review_completed", "submitted_to_head",
  "returned_for_revision",
  // legacy
  "open", "in_review",
]);

interface Props {
  /** When true, hide the inner heading (parent Sheet provides it). */
  embedded?: boolean;
}

export default function EnterpriseCommandCenter({ embedded = false }: Props) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const navigate = useNavigate();

  const {
    isAdmin,
    isOwnerMode,
    adminOverrideMode,
    effectiveAccess,
    effectivePlanSlug,
    effectiveAccessSource,
    hasEnterpriseAccess,
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

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showCreateCase, setShowCreateCase] = useState(false);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const memberCount = members.length;
  const pendingInviteCount = invitations.length;
  const activeCaseCount = cases.filter((c) => ACTIVE_CASE_STATUSES.has(c.status)).length;

  const casesByStatus = cases.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const roleLabel = orgRole ? ROLE_LABEL[orgRole] ?? { ar: orgRole, en: orgRole } : null;
  const isOverrideActive = effectiveAccessSource === "admin_override";

  // ── Header copy ───────────────────────────────────────────────────────────
  const heading = ar ? "مركز المؤسسة" : "Enterprise Command Center";
  const subheading = ar
    ? "إدارة كاملة للمؤسسة والأعضاء والمعاملات في مكان واحد"
    : "Unified workspace for org, members, and engineering cases";

  return (
    <div className="space-y-5" dir={ar ? "rtl" : "ltr"}>
      {/* ── Title + status row ─────────────────────────────────────────── */}
      {!embedded && (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-0.5">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {heading}
            </h2>
            <p className="text-xs text-muted-foreground">{subheading}</p>
          </div>
        </div>
      )}

      {/* Mode / role / source chips */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        <Chip icon={<Sparkles className="w-3 h-3" />}>
          {ar ? "الوصول الفعّال:" : "Effective access:"} <strong className="ms-1">{effectiveAccess || "—"}</strong>
        </Chip>
        <Chip icon={<Layers className="w-3 h-3" />}>
          {ar ? "الباقة:" : "Plan:"} <strong className="ms-1">{effectivePlanSlug || "—"}</strong>
        </Chip>
        {roleLabel && (
          <Chip icon={<Users className="w-3 h-3" />}>
            {ar ? "الدور:" : "Role:"} <strong className="ms-1">{ar ? roleLabel.ar : roleLabel.en}</strong>
          </Chip>
        )}
        {org?.name && (
          <Chip icon={<Building2 className="w-3 h-3" />}>
            {ar ? "المؤسسة:" : "Org:"} <strong className="ms-1 truncate max-w-[140px]">{org.name}</strong>
          </Chip>
        )}
        <Chip>
          {ar ? "المصدر:" : "Source:"} <strong className="ms-1">{effectiveAccessSource}</strong>
        </Chip>
      </div>

      {/* Admin override warning banner */}
      {isOverrideActive && (
        <div className="flex items-start gap-2 rounded-lg p-3 border bg-amber-500/5 border-amber-500/30">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed text-amber-200/90">
            <strong className="font-semibold">
              {ar ? "وضع اختبار الأدمن مفعّل" : "Admin test override active"}
              {adminOverrideMode ? ` — ${adminOverrideMode}` : ""}
            </strong>
            <span className="block opacity-80">
              {ar
                ? "لا يغيّر الفوترة الحقيقية. للعرض والاختبار فقط."
                : "Does not change real billing. View/test only."}
            </span>
          </div>
        </div>
      )}

      {/* ── 1. Quick stats grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label={ar ? "الأعضاء" : "Members"}
          value={memberCount}
          loading={membersLoading}
        />
        <StatCard
          icon={<Mail className="w-4 h-4" />}
          label={ar ? "دعوات معلّقة" : "Pending invites"}
          value={pendingInviteCount}
          loading={invitationsLoading}
          muted={!isOwnerOrAdmin}
        />
        <StatCard
          icon={<Briefcase className="w-4 h-4" />}
          label={ar ? "معاملات نشطة" : "Active cases"}
          value={activeCaseCount}
          loading={casesLoading}
          muted={isFinanceOfficer}
        />
        <StatCard
          icon={<Hourglass className="w-4 h-4" />}
          label={ar ? "إجمالي المعاملات" : "Total cases"}
          value={cases.length}
          loading={casesLoading}
          muted={isFinanceOfficer}
        />
      </div>

      {/* Cases by status mini-row */}
      {!isFinanceOfficer && Object.keys(casesByStatus).length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/40 p-3">
          <p className="text-[11px] font-semibold text-muted-foreground mb-2">
            {ar ? "المعاملات حسب الحالة" : "Cases by status"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(casesByStatus).map(([status, count]) => {
              const lbl = STATUS_LABEL[status] ?? { ar: status, en: status };
              return (
                <Badge key={status} variant="outline" className="text-[10px] px-2 py-0.5">
                  {ar ? lbl.ar : lbl.en}: <strong className="ms-1">{count}</strong>
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 2. Bootstrap (no org yet) — replaces dead empty state ──────── */}
      {!orgLoading && !hasOrganization && canCreateOrganization && (
        <CreateOrganizationCard
          createOrgMutation={createOrganization}
          isOwnerOverride={isOverrideActive || isOwnerMode}
        />
      )}

      {/* ── 3. Organization workspace cards (real availability) ────────── */}
      <SectionTitle ar={ar} en="Organization workspace" arText="مساحة عمل المؤسسة" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <WorkspaceCard
          icon={<Building2 className="w-4 h-4" />}
          title={ar ? "بيانات المؤسسة" : "Organization profile"}
          desc={ar ? "الاسم، الحالة، تاريخ التجربة" : "Name, status, trial dates"}
          available={hasOrganization}
        />
        <WorkspaceCard
          icon={<Users className="w-4 h-4" />}
          title={ar ? "الأعضاء والصلاحيات" : "Members & permissions"}
          desc={ar ? "عرض الأعضاء وأدوارهم" : "View members and roles"}
          available={hasOrganization}
        />
        <WorkspaceCard
          icon={<Mail className="w-4 h-4" />}
          title={ar ? "الدعوات" : "Invitations"}
          desc={ar ? "روابط دعوة يدوية للأعضاء" : "Manual invite links"}
          available={canManageMembers}
        />
        <WorkspaceCard
          icon={<Briefcase className="w-4 h-4" />}
          title={ar ? "المعاملات" : "Engineering cases"}
          desc={ar ? "إنشاء وتتبع المعاملات" : "Create & track cases"}
          available={canCreateCase}
        />
        <WorkspaceCard
          icon={<CheckCircle2 className="w-4 h-4" />}
          title={ar ? "التقارير والاعتمادات" : "Reports & approvals"}
          desc={ar ? "قيد التطوير" : "Coming next"}
          available={false}
        />
        <WorkspaceCard
          icon={<Wallet className="w-4 h-4" />}
          title={ar ? "الفوترة المؤسسية" : "Enterprise billing"}
          desc={ar ? "قريبًا — فوترة المقاعد" : "Coming next — per-seat"}
          available={false}
        />
      </div>

      {/* ── 4. Org card + Members + Invite ─────────────────────────────── */}
      {orgLoading ? (
        <div className="h-24 bg-muted/30 rounded-xl animate-pulse" />
      ) : org ? (
        <OrgCard org={org} orgRole={orgRole ?? "engineer"} />
      ) : null}

      {hasOrganization && (
        <>
          <MemberList
            members={members}
            loading={membersLoading}
            isOwnerOrAdmin={canManageMembers}
            onInviteClick={() => setShowInviteForm(true)}
          />

          {/* Pending invitations summary — visible to owner/admin only */}
          {canManageMembers && !invitationsLoading && invitations.length > 0 && (
            <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold">
                  {ar ? "الدعوات المعلّقة" : "Pending invitations"}
                  <span className="ms-2 text-xs text-muted-foreground font-normal">
                    ({invitations.length})
                  </span>
                </p>
              </div>
              <div className="space-y-1">
                {invitations.slice(0, 5).map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/10 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{inv.email}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {ROLE_LABEL[inv.role]?.[ar ? "ar" : "en"] ?? inv.role}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 shrink-0">
                      {ar ? "قيد الانتظار" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                {ar
                  ? "قبول الدعوة التلقائي قادم؛ حاليًا انسخ الرابط من نموذج الدعوة وأرسله يدويًا."
                  : "Automatic invitation acceptance is coming; for now copy the link from the invite form and share it manually."}
              </p>
            </div>
          )}

          {showInviteForm && canManageMembers && (
            <InviteMemberForm
              inviteMutation={inviteMember}
              onClose={() => setShowInviteForm(false)}
            />
          )}
        </>
      )}

      {/* ── 4. Permission matrix ───────────────────────────────────────── */}
      <SectionTitle ar={ar} en="Roles & permissions" arText="الأدوار والصلاحيات" />
      <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-2">
        {PERMISSION_SUMMARY.map((p) => {
          const isCurrent = orgRole === p.role;
          return (
            <div
              key={p.role}
              className={`flex items-start gap-3 px-3 py-2 rounded-lg ${
                isCurrent ? "bg-primary/5 border border-primary/20" : "bg-muted/10 border border-transparent"
              }`}
            >
              <Badge variant="outline" className="text-[10px] shrink-0">
                {ar ? ROLE_LABEL[p.role].ar : ROLE_LABEL[p.role].en}
              </Badge>
              <p className="text-xs text-muted-foreground flex-1 leading-relaxed">
                {ar ? p.ar : p.en}
              </p>
              {isCurrent && (
                <span className="text-[10px] font-semibold text-primary shrink-0">
                  {ar ? "دورك الحالي" : "Your role"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 6. Case tracking ───────────────────────────────────────────── */}
      {hasOrganization && !isFinanceOfficer && (
        <CaseList
          cases={cases}
          loading={casesLoading}
          isOwnerOrAdmin={canCreateCase}
          onCreateClick={() => setShowCreateCase(true)}
        />
      )}
      <CreateCaseModal
        open={showCreateCase}
        onClose={() => setShowCreateCase(false)}
        createCaseMutation={createCase}
      />

      {/* ── 7. Owner Mode panel ────────────────────────────────────────── */}
      {isOwnerMode && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{
            background: "rgba(255,140,0,0.06)",
            border: "1px solid rgba(255,140,0,0.25)",
          }}
        >
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-300">
              {ar ? "صلاحيات المالك مفعّلة" : "Owner privileges active"}
            </h3>
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 ms-auto">
              <FlaskConical className="w-3 h-3 me-1" />
              {ar ? "وضع اختبار" : "Test mode"}
            </Badge>
          </div>

          {/* Real org link state */}
          <div
            className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
            style={{
              background: hasOrganization ? "rgba(0,212,255,0.08)" : "rgba(255,140,0,0.08)",
              border: `1px solid ${hasOrganization ? "rgba(0,212,255,0.25)" : "rgba(255,140,0,0.30)"}`,
            }}
          >
            <span className="font-medium">
              {hasOrganization
                ? (ar ? "مؤسسة مرتبطة" : "Organization linked")
                : (ar ? "لا توجد مؤسسة" : "No organization")}
            </span>
            <span className="text-muted-foreground truncate max-w-[60%]">
              {hasOrganization && org?.name ? org.name : (ar ? "أنشئ مؤسسة لتفعيل المساحة" : "Create one to activate the workspace")}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(ar
              ? ["كل الأنماط مفتوحة", "بدون حدود يومية", "إدارة الأعضاء", "متابعة المعاملات", "اختبار الاشتراكات"]
              : ["All chat modes", "No daily limits", "Manage members", "Track cases", "Test subscriptions"]
            ).map((c) => (
              <span
                key={c}
                className="text-[10px] px-2 py-0.5 rounded border"
                style={{
                  background: "rgba(255,140,0,0.10)",
                  color: "#FFB870",
                  borderColor: "rgba(255,140,0,0.30)",
                }}
              >
                {c}
              </span>
            ))}
          </div>

          <p className="text-[11px] leading-relaxed text-amber-200/80">
            {ar
              ? "وضع الاختبار لا يغيّر الفوترة، لكن إنشاء المؤسسة والمعاملات بيانات حقيقية في قاعدة البيانات."
              : "Test mode does not change billing, but org and case creation persist as real data in the database."}
          </p>

          {/* CTA grid — adapts to real state */}
          {hasOrganization ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!canManageMembers}
                onClick={() => setShowInviteForm(true)}
                className="justify-start gap-2 border-amber-500/30 text-amber-200 hover:text-amber-100 hover:bg-amber-500/10"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {ar ? "دعوة عضو" : "Invite member"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canCreateCase}
                onClick={() => setShowCreateCase(true)}
                className="justify-start gap-2 border-amber-500/30 text-amber-200 hover:text-amber-100 hover:bg-amber-500/10"
              >
                <Plus className="w-3.5 h-3.5" />
                {ar ? "إنشاء معاملة" : "New case"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/account")}
                className="justify-start gap-2 border-amber-500/30 text-amber-200 hover:text-amber-100 hover:bg-amber-500/10"
              >
                <Users className="w-3.5 h-3.5" />
                {ar ? "فتح الحساب" : "Open account"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/admin")}
                className="justify-start gap-2 border-amber-500/30 text-amber-200 hover:text-amber-100 hover:bg-amber-500/10"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {ar ? "لوحة الإدارة" : "Admin panel"}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { to: "/admin",     icon: <ShieldCheck className="w-3.5 h-3.5" />, ar: "لوحة الإدارة",   en: "Admin panel" },
                { to: "/account",   icon: <Users className="w-3.5 h-3.5" />,       ar: "الحساب والمؤسسة", en: "Account / Org" },
                { to: "/subscribe", icon: <Wallet className="w-3.5 h-3.5" />,      ar: "اختبار الاشتراك", en: "Test subscribe" },
              ].map((link) => (
                <Button
                  key={link.to}
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(link.to)}
                  className="justify-between gap-2 border-amber-500/30 text-amber-200 hover:text-amber-100 hover:bg-amber-500/10"
                >
                  <span className="flex items-center gap-1.5">
                    {link.icon}
                    {ar ? link.ar : link.en}
                  </span>
                  <ArrowUpRight className="w-3 h-3 opacity-60" />
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 7. Coming next ─────────────────────────────────────────────── */}
      <SectionTitle ar={ar} en="Coming next" arText="قيد التطوير" />
      <div className="rounded-xl border border-border/40 bg-card/40 p-4">
        <ul className="space-y-1.5">
          {COMING_NEXT.map((item) => (
            <li key={item.en} className="flex items-center gap-2 text-xs text-muted-foreground">
              <ChevronRight className="w-3 h-3 text-primary/60 shrink-0" />
              <span>{ar ? item.ar : item.en}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Eligibility note — only when the user truly cannot bootstrap. */}
      {!hasOrganization && !canCreateOrganization && !hasEnterpriseAccess && !isAdmin && !isOwnerMode && (
        <div className="rounded-xl border border-border/40 bg-card/40 p-4 text-xs text-muted-foreground leading-relaxed">
          {ar
            ? "هذا المركز يصبح نشطًا عند تسجيل الدخول والانضمام إلى مؤسسة أو ترقية الباقة إلى مؤسسي."
            : "This center activates after sign-in, on joining an organization, or upgrading to Enterprise."}
        </div>
      )}
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
  icon, label, value, loading, muted,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        muted ? "border-border/30 bg-muted/10 opacity-60" : "border-border/40 bg-card/50"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="text-xl font-semibold tabular-nums">
        {loading ? <span className="inline-block w-6 h-5 bg-muted/40 rounded animate-pulse" /> : value}
      </p>
    </div>
  );
}

function WorkspaceCard({
  icon, title, desc, available,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  available: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        available
          ? "border-border/40 bg-card/50"
          : "border-dashed border-border/30 bg-muted/5 opacity-70"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-primary">{icon}</span>
        <p className="text-sm font-medium truncate">{title}</p>
      </div>
      <p className="text-[11px] text-muted-foreground">{desc}</p>
      {!available && (
        <Badge variant="outline" className="mt-2 text-[9px] px-1.5 py-0 border-dashed">
          coming next
        </Badge>
      )}
    </div>
  );
}

function SectionTitle({ ar, arText, en }: { ar: boolean; arText: string; en: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80 mt-2">
      {ar ? arText : en}
    </h3>
  );
}
