import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import type { useOrganization } from "@/hooks/useOrganization";

type CreateCaseMutation = ReturnType<typeof useOrganization>["createCase"];

interface CreateCaseModalProps {
  open: boolean;
  onClose: () => void;
  createCaseMutation: CreateCaseMutation;
}

export default function CreateCaseModal({ open, onClose, createCaseMutation }: CreateCaseModalProps) {
  const { language } = useLanguage();
  const { toast } = useToast();

  const [title, setTitle]           = useState("");
  const [clientName, setClientName] = useState("");
  const [clientRef, setClientRef]   = useState("");
  const [description, setDescription] = useState("");

  const resetForm = () => {
    setTitle("");
    setClientName("");
    setClientRef("");
    setDescription("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCaseMutation.mutateAsync({
        p_title: title,
        p_client_name: clientName || undefined,
        p_client_ref: clientRef || undefined,
        p_description: description || undefined,
      });
      toast({
        title: language === "ar" ? "تم إنشاء القضية" : "Case created",
      });
      resetForm();
      onClose();
    } catch (err: any) {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: err?.message ?? (language === "ar" ? "حدث خطأ غير متوقع" : "An unexpected error occurred"),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { resetForm(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {language === "ar" ? "قضية هندسية جديدة" : "New Engineering Case"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="case-title" className="text-xs">
              {language === "ar" ? "عنوان القضية *" : "Case Title *"}
            </Label>
            <Input
              id="case-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={language === "ar" ? "مثال: مراجعة مخطط حريق المبنى أ" : "e.g. Fire plan review for Building A"}
              className="h-9 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="case-client" className="text-xs">
                {language === "ar" ? "اسم العميل" : "Client Name"}
              </Label>
              <Input
                id="case-client"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={language === "ar" ? "اختياري" : "Optional"}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="case-ref" className="text-xs">
                {language === "ar" ? "رقم المرجع" : "Client Ref"}
              </Label>
              <Input
                id="case-ref"
                value={clientRef}
                onChange={(e) => setClientRef(e.target.value)}
                placeholder={language === "ar" ? "اختياري" : "Optional"}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="case-desc" className="text-xs">
              {language === "ar" ? "الوصف" : "Description"}
            </Label>
            <Textarea
              id="case-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={language === "ar" ? "وصف موجز للقضية (اختياري)" : "Brief description of the case (optional)"}
              className="text-sm resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={() => { resetForm(); onClose(); }}
            >
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              size="sm"
              className="flex-1"
              disabled={createCaseMutation.isPending}
            >
              {createCaseMutation.isPending
                ? (language === "ar" ? "جارٍ الإنشاء…" : "Creating…")
                : (language === "ar" ? "إنشاء القضية" : "Create Case")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
