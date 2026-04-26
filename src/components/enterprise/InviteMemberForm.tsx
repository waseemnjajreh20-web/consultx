import { useState } from "react";
import { Copy, Check, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import type { useOrganization } from "@/hooks/useOrganization";

type InviteMutation = ReturnType<typeof useOrganization>["inviteMember"];

interface InviteMemberFormProps {
  inviteMutation: InviteMutation;
  onClose: () => void;
}

const ROLES = [
  { value: "admin",              labelEn: "Admin",              labelAr: "مدير" },
  { value: "head_of_department", labelEn: "Head of Department", labelAr: "رئيس قسم" },
  { value: "engineer",           labelEn: "Engineer",           labelAr: "مهندس" },
  { value: "finance_officer",    labelEn: "Finance Officer",    labelAr: "مسؤول مالي" },
];

export default function InviteMemberForm({ inviteMutation, onClose }: InviteMemberFormProps) {
  const { language } = useLanguage();
  const { toast } = useToast();

  const [email, setEmail]       = useState("");
  const [role, setRole]         = useState("engineer");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await inviteMutation.mutateAsync({ email, role });
      const link = `${window.location.origin}/accept-invite?token=${result.token}`;
      setInviteLink(link);
      toast({
        title: language === "ar" ? "تم إنشاء الدعوة" : "Invitation created",
        description: language === "ar"
          ? "شارك الرابط يدوياً مع العضو المدعو"
          : "Share the link manually with the invited member",
      });
    } catch (err: any) {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: err?.message ?? (language === "ar" ? "حدث خطأ غير متوقع" : "An unexpected error occurred"),
        variant: "destructive",
      });
    }
  };

  const handleCopy = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (inviteLink) {
    return (
      <div className="bg-card/60 rounded-xl border border-border/40 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-sm">
            {language === "ar" ? "رابط الدعوة" : "Invite Link"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs">
            {language === "ar"
              ? "قبول الدعوة التلقائي قيد التطوير. شارك هذا الرابط مع العضو يدوياً."
              : "Automatic invite acceptance is under development. Share this link manually with the member."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 bg-muted/30 rounded-lg border border-border/40 px-3 py-2 text-xs font-mono text-muted-foreground truncate">
            {inviteLink}
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0 gap-1.5">
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {language === "ar" ? "نسخ" : "Copy"}
          </Button>
        </div>

        <Button variant="ghost" size="sm" className="w-full" onClick={onClose}>
          {language === "ar" ? "إغلاق" : "Close"}
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card/60 rounded-xl border border-border/40 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-sm">
          {language === "ar" ? "دعوة عضو جديد" : "Invite New Member"}
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email" className="text-xs">
            {language === "ar" ? "البريد الإلكتروني" : "Email"}
          </Label>
          <Input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={language === "ar" ? "engineer@example.com" : "engineer@example.com"}
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invite-role" className="text-xs">
            {language === "ar" ? "الدور" : "Role"}
          </Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="invite-role" className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {language === "ar" ? r.labelAr : r.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          size="sm"
          className="w-full"
          disabled={inviteMutation.isPending}
        >
          {inviteMutation.isPending
            ? (language === "ar" ? "جارٍ الإنشاء…" : "Creating…")
            : (language === "ar" ? "إنشاء الدعوة" : "Create Invitation")}
        </Button>
      </form>
    </div>
  );
}
