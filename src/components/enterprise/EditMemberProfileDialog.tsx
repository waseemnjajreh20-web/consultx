import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import type { OrgMemberProfileRow } from "@/lib/memberDisplay";

interface MemberLite {
  id: string;
  user_id: string;
  role: string;
}

interface EditMemberProfileDialogProps {
  open: boolean;
  onClose: () => void;
  member: MemberLite | null;
  existingProfile?: OrgMemberProfileRow | null;
  isAdminEdit: boolean;
  onSubmit: (input: {
    member_id: string;
    display_name_override: string | null;
    role_title_ar: string | null;
    role_title_en: string | null;
    department: string | null;
    phone_ext: string | null;
    notes: string | null;
  }) => Promise<void>;
  pending: boolean;
}

const trimOrNull = (s: string): string | null => {
  const t = s.trim();
  return t.length > 0 ? t : null;
};

export function EditMemberProfileDialog({
  open,
  onClose,
  member,
  existingProfile,
  isAdminEdit,
  onSubmit,
  pending,
}: EditMemberProfileDialogProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const ar = language === "ar";

  const [displayNameOverride, setDisplayNameOverride] = useState("");
  const [roleTitleAr, setRoleTitleAr] = useState("");
  const [roleTitleEn, setRoleTitleEn] = useState("");
  const [department, setDepartment] = useState("");
  const [phoneExt, setPhoneExt] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setDisplayNameOverride(existingProfile?.display_name_override ?? "");
      setRoleTitleAr(existingProfile?.role_title_ar ?? "");
      setRoleTitleEn(existingProfile?.role_title_en ?? "");
      setDepartment(existingProfile?.department ?? "");
      setPhoneExt(existingProfile?.phone_ext ?? "");
      setNotes(existingProfile?.notes ?? "");
    }
  }, [open, existingProfile]);

  const handleSubmit = async () => {
    if (!member) return;
    try {
      await onSubmit({
        member_id: member.id,
        display_name_override: trimOrNull(displayNameOverride),
        role_title_ar: isAdminEdit ? trimOrNull(roleTitleAr) : null,
        role_title_en: isAdminEdit ? trimOrNull(roleTitleEn) : null,
        department: isAdminEdit ? trimOrNull(department) : null,
        phone_ext: trimOrNull(phoneExt),
        notes: isAdminEdit ? trimOrNull(notes) : null,
      });
      toast({ title: ar ? "تم حفظ بيانات العضو" : "Member profile saved" });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ar ? "تعديل بيانات العضو" : "Edit member profile"}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? "تخصيص الاسم والمسمى الوظيفي والقسم الظاهر داخل المؤسسة. لا يؤثر هذا على الدور الأساسي للصلاحيات."
              : "Customize how this member appears inside the organization. Base role permissions are not affected."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2" dir={ar ? "rtl" : "ltr"}>
          <div className="space-y-1.5">
            <Label htmlFor="display-name-override" className="text-xs">
              {ar ? "الاسم المعروض داخل المؤسسة" : "Display name (in this org)"}
            </Label>
            <Input
              id="display-name-override"
              value={displayNameOverride}
              onChange={(e) => setDisplayNameOverride(e.target.value)}
              placeholder={ar ? "مثال: م. أحمد المالك" : "e.g. Eng. Ahmad Al-Malek"}
              maxLength={120}
            />
          </div>

          {isAdminEdit && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="role-title-ar" className="text-xs">
                  {ar ? "المسمى الوظيفي (عربي)" : "Role title (Arabic)"}
                </Label>
                <Input
                  id="role-title-ar"
                  value={roleTitleAr}
                  onChange={(e) => setRoleTitleAr(e.target.value)}
                  placeholder="مثال: مدير قسم المعماري"
                  dir="rtl"
                  maxLength={120}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role-title-en" className="text-xs">
                  {ar ? "المسمى الوظيفي (إنجليزي)" : "Role title (English)"}
                </Label>
                <Input
                  id="role-title-en"
                  value={roleTitleEn}
                  onChange={(e) => setRoleTitleEn(e.target.value)}
                  placeholder="e.g. Head of Architecture"
                  dir="ltr"
                  maxLength={120}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="department" className="text-xs">
                  {ar ? "القسم" : "Department"}
                </Label>
                <Input
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder={ar ? "مثال: القسم المعماري" : "e.g. Architecture Dept."}
                  maxLength={120}
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="phone-ext" className="text-xs">
              {ar ? "تحويلة الهاتف" : "Phone extension"}
            </Label>
            <Input
              id="phone-ext"
              value={phoneExt}
              onChange={(e) => setPhoneExt(e.target.value)}
              placeholder={ar ? "مثال: 1024" : "e.g. 1024"}
              maxLength={32}
            />
          </div>

          {isAdminEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs">
                {ar ? "ملاحظات الإدارة" : "Admin notes"}
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={ar ? "ملاحظات داخلية يراها أعضاء المؤسسة" : "Internal notes visible to org members"}
                maxLength={1000}
              />
              <p className="text-[10px] text-muted-foreground/70">
                {ar
                  ? "ملاحظة: هذه الملاحظات ظاهرة لجميع أعضاء المؤسسة."
                  : "Note: these notes are visible to all members of the organization."}
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={onClose} disabled={pending}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button size="sm" className="flex-1" onClick={handleSubmit} disabled={pending}>
              {pending ? (ar ? "جارٍ…" : "Saving…") : (ar ? "حفظ" : "Save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default EditMemberProfileDialog;
