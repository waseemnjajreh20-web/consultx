/**
 * Founding10Banner — Founding Engineers Offer in-app reactivation banner.
 *
 * Renders only for authenticated users with no active paid access
 * (free, trial_active, trial_expired). Hidden for admin/owner/enterprise/
 * subscribed users. Dismissal is local-only via localStorage; the banner
 * reappears on a fresh device.
 *
 * Premium dark ConsultX identity, bilingual English + Arabic, single CTA.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, X, ArrowRight, ArrowLeft } from "lucide-react";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useLanguage } from "@/hooks/useLanguage";
import {
  FOUNDING10_BANNER_UTM,
  FOUNDING10_COPY,
  buildFounding10Url,
  isFounding10Active,
} from "@/lib/campaigns/founding10";

const DISMISS_KEY = "consultx_founding10_dismissed_v1";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* storage unavailable — silent */
  }
}

export default function Founding10Banner() {
  const navigate = useNavigate();
  const { language, dir } = useLanguage();
  const {
    isLoading,
    isAnonymous,
    isAdmin,
    hasActiveAccess,
    hasEnterpriseAccess,
    isOrgMember,
  } = useEntitlement();

  const isAr = language === "ar";
  const copy = isAr ? FOUNDING10_COPY.ar : FOUNDING10_COPY.en;

  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  if (!isFounding10Active()) return null;
  if (isLoading) return null;
  if (isAnonymous) return null;
  if (isAdmin) return null;
  if (hasActiveAccess) return null;
  if (hasEnterpriseAccess) return null;
  if (isOrgMember) return null;
  if (dismissed) return null;

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://www.consultx.app";
  const ctaUrl = buildFounding10Url(origin, FOUNDING10_BANNER_UTM);

  const handleDismiss = () => {
    persistDismissed();
    setDismissed(true);
  };

  const handleCta = () => {
    navigate(
      ctaUrl.replace(origin, ""),
    );
  };

  return (
    <div
      dir={dir}
      role="region"
      aria-label={copy.eyebrow}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: "12px 18px",
        background:
          "linear-gradient(90deg, rgba(0,212,255,0.10) 0%, rgba(10,14,20,0.92) 60%, rgba(0,212,255,0.06) 100%)",
        borderBottom: "1px solid rgba(0,212,255,0.28)",
        color: "#dff5fb",
        fontSize: "0.88rem",
        flexWrap: "wrap",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 6,
          background: "rgba(0,212,255,0.18)",
          border: "1px solid rgba(0,212,255,0.45)",
          color: "#00D4FF",
          flexShrink: 0,
        }}
      >
        <Sparkles size={15} strokeWidth={1.75} />
      </span>

      <div style={{ flex: 1, minWidth: 240, lineHeight: 1.55 }}>
        <div
          style={{
            color: "#00D4FF",
            fontWeight: 600,
            letterSpacing: 0.3,
            fontSize: "0.74rem",
            textTransform: "uppercase",
          }}
        >
          {copy.eyebrow}
        </div>
        <div style={{ color: "#e3f4fa", fontWeight: 500, marginTop: 2 }}>
          {copy.title}
        </div>
        <div
          style={{
            color: "rgba(200,220,240,0.7)",
            fontSize: "0.78rem",
            marginTop: 2,
          }}
        >
          {copy.disclosureShort}
        </div>
      </div>

      <button
        type="button"
        onClick={handleCta}
        className="cx-founding10-cta"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          borderRadius: 8,
          background: "linear-gradient(90deg, #00D4FF 0%, #1aa8d9 100%)",
          color: "#0a0e14",
          fontWeight: 700,
          fontSize: "0.82rem",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,212,255,0.32)",
          flexShrink: 0,
        }}
      >
        {copy.cta}
        {dir === "rtl"
          ? <ArrowLeft size={14} strokeWidth={2} />
          : <ArrowRight size={14} strokeWidth={2} />}
      </button>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label={isAr ? "إغلاق" : "Dismiss"}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "rgba(200,220,240,0.55)",
          padding: 4,
          display: "flex",
          flexShrink: 0,
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
