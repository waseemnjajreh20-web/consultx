/**
 * AdminEntitlementSwitcher — admin-only, in-sidebar test-mode switcher.
 *
 * E7.2 rewrite: compact dropdown + diagnostic readout + Owner Mode quick-access panel.
 * Replaces the previous always-on vertical button list (the orange brick).
 *
 * Visibility / parent gating:
 *   - Parent (AppShell) gates rendering by `isAdmin`. This component does NOT gate itself.
 *   - The `compact` prop renders a popover-friendly variant for the collapsed sidebar.
 */
import { useEffect, useState } from "react";
import { FlaskConical, ShieldCheck, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useEntitlement } from "@/hooks/useEntitlement";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OVERRIDE_LABELS,
  ADMIN_OVERRIDE_EVENT,
  getAdminEntitlementOverride,
  setAdminEntitlementOverride,
  clearAdminEntitlementOverride,
  type AdminEntitlementOverride,
} from "@/lib/adminEntitlementOverride";

const ACCENT_ADMIN = "#FF8C00";
const NONE_VALUE = "__none__";

const ORDERED: AdminEntitlementOverride[] = ["free", "engineer", "pro", "enterprise", "owner"];

interface Props {
  lang: "ar" | "en";
  /** When true, renders without the outer bordered card (parent provides chrome — e.g. popover). */
  compact?: boolean;
}

export default function AdminEntitlementSwitcher({ lang, compact = false }: Props) {
  const ar = lang === "ar";
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isOwnerMode, effectiveAccess, effectivePlanSlug, effectiveAccessSource } =
    useEntitlement();

  const [current, setCurrent] = useState<AdminEntitlementOverride | null>(
    () => getAdminEntitlementOverride()
  );

  // Stay in sync if another tab / component changes the override.
  useEffect(() => {
    const handler = () => setCurrent(getAdminEntitlementOverride());
    window.addEventListener(ADMIN_OVERRIDE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(ADMIN_OVERRIDE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const handleChange = (raw: string) => {
    if (raw === NONE_VALUE) {
      clearAdminEntitlementOverride();
      setCurrent(null);
      toast({
        title: ar ? "تم إيقاف وضع الاختبار" : "Admin override cleared",
        description: ar ? "عدنا للوضع الحقيقي" : "Returned to real mode",
      });
      return;
    }
    const value = raw as AdminEntitlementOverride;
    setAdminEntitlementOverride(value);
    setCurrent(value);
    toast({
      title: ar ? "تم تحديث وضع الاختبار" : "Admin test mode updated",
      description: ar ? OVERRIDE_LABELS[value].ar : OVERRIDE_LABELS[value].en,
    });
  };

  const triggerLabel = current
    ? (ar ? OVERRIDE_LABELS[current].ar : OVERRIDE_LABELS[current].en)
    : (ar ? "حقيقي (بلا تجاوز)" : "Real (no override)");

  const showOwnerPanel = current === "owner" || isOwnerMode;

  const containerClass = compact
    ? "space-y-2"
    : "mx-2 rounded-xl p-2.5 space-y-2 bg-white/5 backdrop-blur border border-white/10";

  return (
    <div className={containerClass} dir={ar ? "rtl" : "ltr"}>
      {/* Header row: badge + warning */}
      <div className="flex items-center gap-1.5">
        <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ACCENT_ADMIN }} />
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 leading-tight border-amber-500/40 text-amber-400"
        >
          {ar ? "وضع الاختبار" : "Admin Test"}
        </Badge>
      </div>

      {/* Mode select */}
      <Select value={current ?? NONE_VALUE} onValueChange={handleChange}>
        <SelectTrigger
          className="h-8 text-[11px] bg-black/30 border-white/10 text-white/85 px-2"
          aria-label={ar ? "اختر وضع الاختبار" : "Select test mode"}
        >
          <SelectValue placeholder={triggerLabel}>{triggerLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent className="text-[11px]">
          <SelectItem value={NONE_VALUE}>
            {ar ? "حقيقي (بلا تجاوز)" : "Real (no override)"}
          </SelectItem>
          {ORDERED.map((k) => (
            <SelectItem key={k} value={k}>
              {ar ? OVERRIDE_LABELS[k].ar : OVERRIDE_LABELS[k].en}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Diagnostic readout — admin-only insight into backend state */}
      <div
        className="rounded-md px-2 py-1.5 text-[10px] leading-snug font-mono space-y-0.5"
        style={{
          background: "rgba(0,0,0,0.25)",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        <div>access: <span className="text-white/80">{effectiveAccess || "—"}</span></div>
        <div>plan: <span className="text-white/80">{effectivePlanSlug || "—"}</span></div>
        <div>owner_mode: <span className="text-white/80">{String(isOwnerMode)}</span></div>
        <div>source: <span className="text-white/80">{effectiveAccessSource || "—"}</span></div>
      </div>

      {/* Warning — never affects real billing */}
      <p className="text-[10px] leading-tight text-amber-300/70">
        {ar ? "لا يغيّر الفوترة الحقيقية" : "Does not change real billing"}
      </p>

      {/* Owner Mode quick controls */}
      {showOwnerPanel && (
        <div
          className="rounded-lg p-2 space-y-1.5"
          style={{
            background: "rgba(255,140,0,0.06)",
            border: "1px solid rgba(255,140,0,0.22)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3" style={{ color: ACCENT_ADMIN }} />
            <span className="text-[10px] font-semibold" style={{ color: ACCENT_ADMIN }}>
              {ar ? "تحكم المالك" : "Owner Control"}
            </span>
          </div>

          <div className="flex flex-wrap gap-1">
            {(ar
              ? ["صلاحيات كاملة", "كل الأنماط مفتوحة", "بدون حدود يومية", "لا يغيّر الفوترة"]
              : ["Full perms", "All modes", "No daily limits", "No billing impact"]
            ).map((chip) => (
              <span
                key={chip}
                className="text-[9px] px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(255,140,0,0.12)",
                  color: "#FFB870",
                  border: "1px solid rgba(255,140,0,0.25)",
                }}
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-1 pt-0.5">
            {[
              { to: "/admin",     ar: "لوحة الإدارة",   en: "Admin panel" },
              { to: "/account",   ar: "الحساب والمؤسسة", en: "Account / Org" },
              { to: "/subscribe", ar: "اختبار الاشتراك", en: "Test subscribe" },
            ].map((link) => (
              <button
                key={link.to}
                onClick={() => navigate(link.to)}
                className="flex items-center justify-between gap-2 text-[10px] px-1.5 py-1 rounded text-white/80 hover:text-white hover:bg-white/5 transition-colors"
              >
                <span>{ar ? link.ar : link.en}</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
