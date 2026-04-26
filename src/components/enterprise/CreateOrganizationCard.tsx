/**
 * CreateOrganizationCard — bootstrap CTA shown when the current user has no
 * organization. Calls the SECURITY DEFINER RPC `create_organization_with_owner`
 * which atomically inserts the org row + the founding owner membership.
 */
import { useState } from "react";
import { Building2, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import type { useOrganization } from "@/hooks/useOrganization";

type CreateOrgMutation = ReturnType<typeof useOrganization>["createOrganization"];

interface Props {
  createOrgMutation: CreateOrgMutation;
  /** True when admin entitlement override is active. We surface a clear note
      that owner-mode does NOT auto-create an org. */
  isOwnerOverride?: boolean;
}

export default function CreateOrganizationCard({ createOrgMutation, isOwnerOverride }: Props) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createOrgMutation.mutateAsync({ name });
      toast({
        title: ar ? "تم إنشاء المؤسسة" : "Organization created",
        description: ar
          ? "تم ربط حسابك كمالك للمؤسسة. يمكنك الآن دعوة الأعضاء وإنشاء المعاملات."
          : "You are now the owner. Invite members and create cases below.",
      });
      setName("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (ar ? "حدث خطأ غير متوقع" : "Unexpected error");
      setError(msg);
      toast({
        title: ar ? "تعذّر إنشاء المؤسسة" : "Could not create organization",
        description: msg,
        variant: "destructive",
      });
    }
  };

  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{
        background: "linear-gradient(180deg, rgba(0,212,255,0.08) 0%, rgba(0,212,255,0.02) 100%)",
        border: "1px solid rgba(0,212,255,0.25)",
      }}
      dir={ar ? "rtl" : "ltr"}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {ar ? "ابدأ مساحة العمل المؤسسية" : "Start your enterprise workspace"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {ar
              ? "أنشئ مؤسسة فعلية لربط الأعضاء والمعاملات والصلاحيات. حسابك سيُسجَّل كمالك تلقائيًا."
              : "Create a real organization to link members, cases, and permissions. Your account becomes the owner automatically."}
          </p>
        </div>
      </div>

      {isOwnerOverride && (
        <div className="flex items-start gap-2 rounded-lg p-2.5 border bg-amber-500/5 border-amber-500/30">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-amber-200/90">
            {ar
              ? "وضع المالك يمنح صلاحيات اختبار، لكنه لا ينشئ مؤسسة تلقائيًا. أنشئ مؤسسة حقيقية أدناه."
              : "Owner mode grants test privileges but does not auto-create an organization. Create a real one below."}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="org-name" className="text-xs">
            {ar ? "اسم المؤسسة" : "Organization name"}
          </Label>
          <Input
            id="org-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={ar
              ? "مثال: مؤسسة العباقرة الأوائل للاستشارات الهندسية"
              : "e.g. ConsultX Engineering Consultancy"}
            disabled={createOrgMutation.isPending}
            className="h-10 text-sm"
          />
        </div>

        {error && (
          <p className="text-[11px] text-red-400 leading-relaxed">{error}</p>
        )}

        <Button
          type="submit"
          size="sm"
          className="w-full"
          disabled={createOrgMutation.isPending || !name.trim()}
        >
          {createOrgMutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />
              {ar ? "جارٍ الإنشاء…" : "Creating…"}
            </>
          ) : (
            ar ? "إنشاء المؤسسة وربط حسابي كمالك" : "Create organization and link my account as owner"
          )}
        </Button>
      </form>

      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
        {ar
          ? "بعد الإنشاء يمكنك دعوة الأعضاء، إنشاء المعاملات، ومتابعة المراجعات. كل عضو يمكنه الانتماء لمؤسسة واحدة."
          : "After creation you can invite members, create cases, and track reviews. Each user belongs to one organization."}
      </p>
    </div>
  );
}
