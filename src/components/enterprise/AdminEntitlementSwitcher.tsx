import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEntitlement } from "@/hooks/useEntitlement";
import {
  OVERRIDE_LABELS,
  getAdminEntitlementOverride,
  setAdminEntitlementOverride,
  clearAdminEntitlementOverride,
  type AdminEntitlementOverride,
} from "@/lib/adminEntitlementOverride";

const ACCENT_ADMIN = "#FF8C00";

const ALL_OPTIONS: Array<{ value: AdminEntitlementOverride | null; labelEn: string; labelAr: string }> = [
  { value: null,         labelEn: "— Real (no override)", labelAr: "— حقيقي (بلا تجاوز)" },
  { value: "free",       ...labelPair("free")       },
  { value: "engineer",   ...labelPair("engineer")   },
  { value: "pro",        ...labelPair("pro")         },
  { value: "enterprise", ...labelPair("enterprise") },
  { value: "owner",      ...labelPair("owner")       },
];

function labelPair(k: AdminEntitlementOverride) {
  return { labelEn: OVERRIDE_LABELS[k].en, labelAr: OVERRIDE_LABELS[k].ar };
}

interface Props {
  lang: "ar" | "en";
}

export default function AdminEntitlementSwitcher({ lang }: Props) {
  const { refetch } = useEntitlement();
  const { toast }   = useToast();
  const ar = lang === "ar";

  const [current, setCurrent] = useState<AdminEntitlementOverride | null>(
    () => getAdminEntitlementOverride()
  );

  const handleSelect = (value: AdminEntitlementOverride | null) => {
    if (value) {
      setAdminEntitlementOverride(value);
    } else {
      clearAdminEntitlementOverride();
    }
    setCurrent(value);
    refetch();
    toast({ title: ar ? "تم تحديث وضع الاختبار" : "Admin test mode updated" });
  };

  return (
    <div
      className="mx-2 rounded-xl p-2.5 space-y-2"
      style={{
        background: "rgba(255,140,0,0.07)",
        border: "1px solid rgba(255,140,0,0.2)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-0.5">
        <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ACCENT_ADMIN }} />
        <span className="text-[11px] font-semibold" style={{ color: ACCENT_ADMIN }}>
          {ar ? "وضع الاختبار" : "Admin Test Mode"}
        </span>
      </div>

      {/* Options */}
      <div className="space-y-0.5">
        {ALL_OPTIONS.map(({ value, labelEn, labelAr }) => {
          const isSelected = current === value;
          return (
            <button
              key={value ?? "__none__"}
              onClick={() => handleSelect(value)}
              className="w-full text-start text-[11px] px-2 py-1 rounded-lg transition-all"
              style={{
                background: isSelected ? "rgba(255,140,0,0.15)" : "transparent",
                color: isSelected ? ACCENT_ADMIN : "rgba(255,255,255,0.38)",
                border: isSelected ? "1px solid rgba(255,140,0,0.35)" : "1px solid transparent",
                fontWeight: isSelected ? 600 : 400,
              }}
            >
              {ar ? labelAr : labelEn}
            </button>
          );
        })}
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] leading-tight px-0.5" style={{ color: "rgba(255,140,0,0.45)" }}>
        {ar ? "لا يؤثر على الفواتير الفعلية" : "Does not affect real billing"}
      </p>
    </div>
  );
}
