/**
 * E7.10A — Dialog for publishing a public case update.
 *
 * Calls the publish_case_public_update RPC. Pre-fills public_status and
 * progress_percent from the deterministic mapping based on the case's
 * current internal status; both are editable.
 *
 * The notify_client toggle is wired but provider integration is deferred
 * to E7.10C, so we render a plain advisory note next to it.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  PUBLIC_STATUS_MAP,
  type CaseInternalStatus,
} from "@/lib/enterprise/casePublicMapping";

interface Props {
  open: boolean;
  onClose: () => void;
  caseId: string;
  caseStatus: CaseInternalStatus | string;
  ar: boolean;
}

export default function PublishCaseUpdateDialog({ open, onClose, caseId, caseStatus, ar }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [publicStatus, setPublicStatus] = useState<string>(caseStatus);
  const [progress, setProgress] = useState<number>(
    PUBLIC_STATUS_MAP[caseStatus as CaseInternalStatus]?.progress ?? 0,
  );
  const [actionRequired, setActionRequired] = useState(false);
  const [actionAr, setActionAr] = useState("");
  const [actionEn, setActionEn] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);

  // Reset form whenever the dialog opens (so each publish is fresh).
  useEffect(() => {
    if (!open) return;
    setTitleAr("");
    setTitleEn("");
    setBodyAr("");
    setBodyEn("");
    setPublicStatus(caseStatus);
    setProgress(PUBLIC_STATUS_MAP[caseStatus as CaseInternalStatus]?.progress ?? 0);
    setActionRequired(false);
    setActionAr("");
    setActionEn("");
    setNotifyClient(false);
  }, [open, caseStatus]);

  const onStatusChange = (v: string) => {
    setPublicStatus(v);
    setProgress(PUBLIC_STATUS_MAP[v as CaseInternalStatus]?.progress ?? progress);
  };

  const publish = useMutation({
    mutationFn: async () => {
      if (!titleAr.trim()) throw new Error(ar ? "العنوان (عربي) مطلوب" : "Arabic title is required");
      if (progress < 0 || progress > 100) throw new Error(ar ? "النسبة يجب أن تكون بين 0 و 100" : "Progress must be between 0 and 100");
      const { error } = await supabase.rpc("publish_case_public_update", {
        p_case_id: caseId,
        p_title_ar: titleAr.trim(),
        p_title_en: titleEn.trim() || null,
        p_body_ar: bodyAr.trim() || null,
        p_body_en: bodyEn.trim() || null,
        p_public_status: publicStatus,
        p_progress_percent: progress,
        p_client_action_required: actionRequired,
        p_required_action_ar: actionRequired ? (actionAr.trim() || null) : null,
        p_required_action_en: actionRequired ? (actionEn.trim() || null) : null,
        p_notify_client: notifyClient,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_public_updates", caseId] });
      qc.invalidateQueries({ queryKey: ["case_public_tracking", caseId] });
      toast({ title: ar ? "تم نشر التحديث" : "Update published" });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl" dir={ar ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="text-base">
            {ar ? "نشر تحديث للعميل" : "Publish update to client"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{ar ? "الحالة العامة" : "Public status"}</Label>
              <Select value={publicStatus} onValueChange={onStatusChange}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PUBLIC_STATUS_MAP).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{ar ? v.ar : v.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{ar ? "النسبة (%)" : "Progress (%)"}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{ar ? "العنوان (عربي) *" : "Title (Arabic) *"}</Label>
              <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{ar ? "العنوان (إنجليزي)" : "Title (English)"}</Label>
              <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className="h-9 text-sm" dir="ltr" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{ar ? "النص (عربي)" : "Body (Arabic)"}</Label>
              <Textarea value={bodyAr} onChange={(e) => setBodyAr(e.target.value)} className="text-sm resize-none min-h-[72px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{ar ? "النص (إنجليزي)" : "Body (English)"}</Label>
              <Textarea value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} className="text-sm resize-none min-h-[72px]" dir="ltr" />
            </div>
          </div>

          <div className="rounded-md border border-border/30 p-3 space-y-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm font-medium">{ar ? "هذا التحديث يتطلب إجراءً من العميل" : "This update requires client action"}</span>
              <Switch checked={actionRequired} onCheckedChange={setActionRequired} />
            </label>
            {actionRequired && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{ar ? "الإجراء المطلوب (عربي)" : "Required action (Arabic)"}</Label>
                  <Textarea value={actionAr} onChange={(e) => setActionAr(e.target.value)} className="text-sm resize-none min-h-[60px]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{ar ? "الإجراء المطلوب (إنجليزي)" : "Required action (English)"}</Label>
                  <Textarea value={actionEn} onChange={(e) => setActionEn(e.target.value)} className="text-sm resize-none min-h-[60px]" dir="ltr" />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md border border-border/30 p-3 space-y-2">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm font-medium">{ar ? "إشعار العميل" : "Notify client"}</span>
              <Switch checked={notifyClient} onCheckedChange={setNotifyClient} />
            </label>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {ar
                ? "سيتم تسجيل النية لإرسال إشعار. الإرسال الفعلي عبر SMS/WhatsApp/البريد سيُفعَّل في مرحلة E7.10C."
                : "The intent to notify is recorded. Actual SMS/WhatsApp/email dispatch will be enabled in phase E7.10C."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={publish.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button className="gap-1.5" onClick={() => publish.mutate()} disabled={publish.isPending || !titleAr.trim()}>
            <Send className="w-3.5 h-3.5" />
            {publish.isPending ? (ar ? "جارٍ النشر…" : "Publishing…") : (ar ? "نشر" : "Publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
