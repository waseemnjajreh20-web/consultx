/**
 * E7.10A — Client contact form. Persists case_client_contacts via the
 * upsert_case_client_contact RPC. Phone/email validation is best-effort
 * (E.164 + RFC-ish email); the RPC is the authoritative gate.
 */

import { useEffect, useState } from "react";
import { Save, User2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type ChannelValue = "sms" | "whatsapp" | "email" | "none";

export interface CaseClientContactRow {
  id: string;
  case_id: string;
  client_name: string | null;
  phone_e164: string | null;
  email: string | null;
  preferred_channel: ChannelValue;
  receive_updates: boolean;
}

interface Props {
  caseId: string;
  initial: CaseClientContactRow | null;
  ar: boolean;
}

const E164_RE = /^\+[1-9]\d{6,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ClientContactPanel({ caseId, initial, ar }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [clientName, setClientName] = useState(initial?.client_name ?? "");
  const [phone, setPhone] = useState(initial?.phone_e164 ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [channel, setChannel] = useState<ChannelValue>(initial?.preferred_channel ?? "none");
  const [receive, setReceive] = useState(initial?.receive_updates ?? true);
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  // Re-sync when the initial row changes (case switch).
  useEffect(() => {
    setClientName(initial?.client_name ?? "");
    setPhone(initial?.phone_e164 ?? "");
    setEmail(initial?.email ?? "");
    setChannel(initial?.preferred_channel ?? "none");
    setReceive(initial?.receive_updates ?? true);
    setPhoneErr(null);
    setEmailErr(null);
  }, [initial]);

  const validate = (): boolean => {
    let ok = true;
    if (phone.trim() && !E164_RE.test(phone.trim())) {
      setPhoneErr(ar ? "صيغة E.164 مثل: +9665XXXXXXXX" : "E.164 format, e.g. +9665XXXXXXXX");
      ok = false;
    } else { setPhoneErr(null); }
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      setEmailErr(ar ? "بريد إلكتروني غير صالح" : "Invalid email");
      ok = false;
    } else { setEmailErr(null); }
    return ok;
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("upsert_case_client_contact", {
        p_case_id: caseId,
        p_client_name: clientName.trim() || null,
        p_phone_e164: phone.trim() || null,
        p_email: email.trim() || null,
        p_preferred_channel: channel,
        p_receive_updates: receive,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_client_contacts", caseId] });
      toast({ title: ar ? "تم الحفظ" : "Saved" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    },
  });

  const onSave = () => { if (validate()) save.mutate(); };

  return (
    <div className="rounded-lg border border-border/40 bg-card/40 p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <User2 className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-semibold">{ar ? "بيانات العميل" : "Client contact"}</p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{ar ? "اسم العميل" : "Client name"}</Label>
          <Input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder={ar ? "الاسم الكامل" : "Full name"}
            className="h-9 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{ar ? "الجوال (E.164)" : "Phone (E.164)"}</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+9665XXXXXXXX"
              className="h-9 text-sm font-mono"
              dir="ltr"
            />
            {phoneErr && <p className="text-[11px] text-red-400">{phoneErr}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{ar ? "البريد الإلكتروني" : "Email"}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com"
              className="h-9 text-sm"
              dir="ltr"
            />
            {emailErr && <p className="text-[11px] text-red-400">{emailErr}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">{ar ? "قناة التواصل المفضلة" : "Preferred channel"}</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as ChannelValue)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{ar ? "بدون" : "None"}</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">{ar ? "بريد إلكتروني" : "Email"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border/30 px-3 py-2 cursor-pointer">
            <span className="text-xs">{ar ? "السماح بإرسال التحديثات" : "Allow updates"}</span>
            <Switch checked={receive} onCheckedChange={setReceive} />
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {ar
            ? "ملاحظة: الإرسال الفعلي عبر SMS / WhatsApp غير مفعّل بعد. سيُتاح في مرحلة لاحقة."
            : "Note: SMS / WhatsApp dispatch is not yet enabled — coming in a later phase."}
        </p>
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" disabled={save.isPending} onClick={onSave}>
          <Save className="w-3.5 h-3.5" />
          {save.isPending ? (ar ? "جارٍ…" : "Saving…") : (ar ? "حفظ" : "Save")}
        </Button>
      </div>
    </div>
  );
}
