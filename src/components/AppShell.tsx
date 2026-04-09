/**
 * AppShell — ConsultX workspace layout wrapper.
 *
 * Provides:
 *  - Left collapsible sidebar nav (desktop only, w-16 icon rail)
 *  - Section content panel (w-72, slides in when section active)
 *  - Center: main content slot (ChatInterface)
 *  - Right: source pane (480px, desktop) or slide-over (mobile)
 *
 * 3-pane behaviour: sidebar + chat + source pane appears only when a source is open.
 * Mobile: sidebar nav hidden; source panel stays as slide-over.
 */

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare, UserCircle, CreditCard, Settings, Sliders,
  LogOut, ExternalLink, Upload, CheckCircle, X, ChevronRight,
  ShieldCheck, ChevronLeft,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useEntitlement } from "@/hooks/useEntitlement";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import SourcePanel from "@/components/SourcePanel";
import type { SourcePanelState } from "@/components/SourcePanel";
import type { SourceMeta } from "@/utils/sourceMetadata";

// ── Visual constants — ConsultX dark identity ────────────────────────────────
const SIDEBAR_BG  = "rgba(10, 14, 20, 0.97)";
const SECTION_BG  = "rgba(12, 17, 26, 0.98)";
const BORDER      = "rgba(0, 212, 255, 0.12)";
const ACCENT      = "#00D4FF";

type SidebarSection = "account" | "subscription" | "settings" | "customization" | null;

// ── Props ────────────────────────────────────────────────────────────────────
export interface AppShellProps {
  children: React.ReactNode;
  sourcePanel: SourcePanelState;
  onSourceClose: () => void;
  onSourceSelectSource: (meta: SourceMeta) => void;
  onSourceBack: () => void;
  /** Ref populated by ChatInterface so the sidebar can trigger the history modal */
  historyTriggerRef: React.MutableRefObject<(() => void) | null>;
}

// ── Sidebar nav item descriptor ───────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "conversations" as const, icon: MessageSquare },
  { id: "account"       as const, icon: UserCircle    },
  { id: "subscription"  as const, icon: CreditCard    },
  { id: "settings"      as const, icon: Settings      },
  { id: "customization" as const, icon: Sliders       },
] as const;

// ── Labels helper ─────────────────────────────────────────────────────────────
function label(id: string, lang: "ar" | "en") {
  const map: Record<string, [string, string]> = {
    conversations: ["المحادثات",   "Conversations"],
    account:       ["الحساب",      "Account"      ],
    subscription:  ["الاشتراك",   "Subscription" ],
    settings:      ["الإعدادات",   "Settings"     ],
    customization: ["التخصيص",    "Customization"],
  };
  return lang === "ar" ? map[id]?.[0] : map[id]?.[1];
}

// ════════════════════════════════════════════════════════════════════════════════
// AppShell
// ════════════════════════════════════════════════════════════════════════════════
export default function AppShell({
  children,
  sourcePanel,
  onSourceClose,
  onSourceSelectSource,
  onSourceBack,
  historyTriggerRef,
}: AppShellProps) {
  const { language } = useLanguage();
  const lang = language as "ar" | "en";
  const isRtl = lang === "ar";
  const { isAdmin } = useEntitlement();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SidebarSection>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleNavClick = (id: string) => {
    if (id === "conversations") {
      historyTriggerRef.current?.();
      return;
    }
    if (id === "admin") {
      navigate("/admin");
      return;
    }
    setActiveSection(prev => prev === id ? null : id as SidebarSection);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── LEFT SIDEBAR (desktop) ───────────────────────────────────────────── */}
      <nav
        className="hidden md:flex flex-col flex-shrink-0 py-3 gap-0.5 overflow-hidden transition-all duration-200"
        style={{
          width: sidebarOpen ? "192px" : "56px",
          background: SIDEBAR_BG,
          borderRight: isRtl ? "none" : `1px solid ${BORDER}`,
          borderLeft: isRtl ? `1px solid ${BORDER}` : "none",
        }}
        dir={isRtl ? "rtl" : "ltr"}
      >
        {NAV_ITEMS.map(({ id, icon: Icon }) => {
          const isActive = id !== "conversations" && activeSection === id;
          return (
            <button
              key={id}
              onClick={() => handleNavClick(id)}
              title={!sidebarOpen ? label(id, lang) : undefined}
              aria-label={label(id, lang)}
              className="group flex items-center mx-2 p-2.5 rounded-xl transition-all duration-150 min-w-0"
              style={{
                background: isActive ? "rgba(0,212,255,0.12)" : "transparent",
                color: isActive ? ACCENT : "rgba(255,255,255,0.4)",
                border: isActive ? `1px solid rgba(0,212,255,0.3)` : "1px solid transparent",
              }}
            >
              <Icon className="w-5 h-5 flex-shrink-0 group-hover:opacity-90 transition-opacity" />
              {sidebarOpen && (
                <span className="text-xs font-medium ms-2.5 truncate opacity-80 group-hover:opacity-100 transition-opacity">
                  {label(id, lang)}
                </span>
              )}
            </button>
          );
        })}

        {/* Admin — only when user is admin */}
        {isAdmin && (
          <button
            onClick={() => handleNavClick("admin")}
            title={!sidebarOpen ? (isRtl ? "الإدارة" : "Admin") : undefined}
            aria-label={isRtl ? "الإدارة" : "Admin"}
            className="group flex items-center mx-2 p-2.5 rounded-xl transition-all duration-150 min-w-0"
            style={{ color: "#FF8C00", border: "1px solid transparent" }}
          >
            <ShieldCheck className="w-5 h-5 flex-shrink-0 group-hover:opacity-90 transition-opacity" />
            {sidebarOpen && (
              <span className="text-xs font-medium ms-2.5 truncate opacity-80 group-hover:opacity-100 transition-opacity">
                {isRtl ? "الإدارة" : "Admin"}
              </span>
            )}
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Collapse / expand toggle */}
        <button
          onClick={() => setSidebarOpen(p => !p)}
          title={sidebarOpen ? (isRtl ? "طي" : "Collapse") : (isRtl ? "توسيع" : "Expand")}
          aria-label={sidebarOpen ? (isRtl ? "طي" : "Collapse") : (isRtl ? "توسيع" : "Expand")}
          className="group flex items-center mx-2 p-2.5 rounded-xl transition-all duration-150"
          style={{ color: "rgba(255,255,255,0.25)", border: "1px solid transparent" }}
        >
          {sidebarOpen
            ? (isRtl ? <ChevronRight className="w-4 h-4 group-hover:text-white transition-colors" /> : <ChevronLeft className="w-4 h-4 group-hover:text-white transition-colors" />)
            : (isRtl ? <ChevronLeft className="w-4 h-4 group-hover:text-white transition-colors" /> : <ChevronRight className="w-4 h-4 group-hover:text-white transition-colors" />)
          }
        </button>
      </nav>

      {/* ── SECTION CONTENT PANEL ─────────────────────────────────────────────── */}
      {activeSection && (
        <div
          className="hidden md:flex flex-col w-72 flex-shrink-0 overflow-hidden"
          style={{
            background: SECTION_BG,
            borderRight: isRtl ? "none" : `1px solid ${BORDER}`,
            borderLeft: isRtl ? `1px solid ${BORDER}` : "none",
          }}
        >
          <SectionPanel
            section={activeSection}
            lang={lang}
            onClose={() => setActiveSection(null)}
          />
        </div>
      )}

      {/* ── MAIN CONTENT (ChatInterface) ──────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {children}
      </div>

      {/* ── RIGHT SOURCE PANE — desktop 3rd pane ─────────────────────────────── */}
      {sourcePanel.open && (
        <div
          className="hidden md:flex w-[480px] lg:w-[520px] flex-shrink-0"
          style={{ borderLeft: `1px solid ${BORDER}` }}
        >
          <SourcePanel
            state={sourcePanel}
            language={lang}
            onClose={onSourceClose}
            onSelectSource={onSourceSelectSource}
            onBack={onSourceBack}
            mode="pane"
          />
        </div>
      )}

      {/* ── MOBILE SOURCE PANEL — slide-over ─────────────────────────────────── */}
      <div className="md:hidden">
        <SourcePanel
          state={sourcePanel}
          language={lang}
          onClose={onSourceClose}
          onSelectSource={onSourceSelectSource}
          onBack={onSourceBack}
          mode="overlay"
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// SectionPanel — renders the active sidebar section's content
// ════════════════════════════════════════════════════════════════════════════════
function SectionPanel({
  section,
  lang,
  onClose,
}: {
  section: SidebarSection;
  lang: "ar" | "en";
  onClose: () => void;
}) {
  const ar = lang === "ar";
  const title = label(section!, lang) ?? "";

  return (
    <div className="flex flex-col h-full" dir={ar ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <span className="text-sm font-semibold text-white">{title}</span>
        <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {section === "account"       && <AccountSection      lang={lang} />}
        {section === "subscription"  && <SubscriptionSection lang={lang} />}
        {section === "settings"      && <SettingsSection     lang={lang} />}
        {section === "customization" && <CustomizationSection lang={lang} />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Account section
// ════════════════════════════════════════════════════════════════════════════════
function AccountSection({ lang }: { lang: "ar" | "en" }) {
  const { user, isAdmin, isPaidActive, isTrialActive, isFreeLoggedIn } = useEntitlement();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const ar = lang === "ar";

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "?";

  const planLabel = isAdmin
    ? (ar ? "مدير" : "Admin")
    : isPaidActive && !isTrialActive
    ? (ar ? "اشتراك نشط" : "Active Plan")
    : isTrialActive
    ? (ar ? "تجربة مجانية" : "Trial")
    : (ar ? "مجاني" : "Free");

  const planColor = isAdmin ? "#FF8C00"
    : isPaidActive && !isTrialActive ? ACCENT
    : isTrialActive ? "#22c55e"
    : "rgba(255,255,255,0.4)";

  return (
    <div className="p-4 space-y-4">
      {/* Avatar */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold"
          style={{ background: "rgba(0,212,255,0.15)", color: ACCENT, border: `2px solid rgba(0,212,255,0.3)` }}
        >
          {initials}
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-white truncate max-w-[200px]">{user?.email}</p>
          <span
            className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: `${planColor}20`, color: planColor, border: `1px solid ${planColor}40` }}
          >
            {planLabel}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => navigate("/account")}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-white hover:bg-white/5 transition-colors border border-white/10"
        >
          <span>{ar ? "إدارة الحساب" : "Manage Account"}</span>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </button>

        {isFreeLoggedIn && (
          <button
            onClick={() => navigate("/subscribe")}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ background: "rgba(0,212,255,0.12)", color: ACCENT, border: `1px solid rgba(0,212,255,0.3)` }}
          >
            <span>{ar ? "ترقية الخطة" : "Upgrade Plan"}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => signOut()}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors border border-red-500/20"
        >
          <LogOut className="w-4 h-4" />
          <span>{ar ? "تسجيل الخروج" : "Sign Out"}</span>
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Subscription section
// ════════════════════════════════════════════════════════════════════════════════
function SubscriptionSection({ lang }: { lang: "ar" | "en" }) {
  const { subscription, isPaidActive, isTrialActive, trialDaysRemaining, trialHoursRemaining, isFreeLoggedIn } = useEntitlement();
  const navigate = useNavigate();
  const ar = lang === "ar";

  const statusColor = isPaidActive && !isTrialActive
    ? ACCENT
    : isTrialActive
    ? "#22c55e"
    : "rgba(255,255,255,0.4)";

  const statusLabel = isPaidActive && !isTrialActive
    ? (ar ? "نشط" : "Active")
    : isTrialActive
    ? (ar ? "تجربة مجانية" : "Trial Active")
    : (ar ? "مجاني" : "Free");

  const planName = subscription?.plan_name
    || (isTrialActive ? (ar ? "تجربة المهندسين" : "Engineer Trial") : (ar ? "المجاني" : "Free"));

  return (
    <div className="p-4 space-y-4">
      {/* Plan card */}
      <div
        className="rounded-2xl p-4 space-y-3"
        style={{ background: "rgba(0,212,255,0.05)", border: `1px solid rgba(0,212,255,0.15)` }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{ar ? "الخطة الحالية" : "Current Plan"}</p>
            <p className="text-base font-semibold text-white mt-0.5">{planName}</p>
          </div>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: `${statusColor}20`, color: statusColor }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Trial countdown */}
        {isTrialActive && trialDaysRemaining !== null && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{ar ? "أيام التجربة المتبقية" : "Trial days remaining"}</span>
              <span className="font-medium" style={{ color: trialDaysRemaining <= 2 ? "#ef4444" : "#22c55e" }}>
                {trialDaysRemaining > 0
                  ? `${trialDaysRemaining} ${ar ? "يوم" : "days"}`
                  : `${trialHoursRemaining ?? 0} ${ar ? "ساعة" : "hrs"}`}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, ((trialDaysRemaining ?? 0) / 7) * 100)}%`,
                  background: trialDaysRemaining <= 2 ? "#ef4444" : "#22c55e",
                }}
              />
            </div>
          </div>
        )}

        {/* Expiry */}
        {subscription?.current_period_end && (
          <p className="text-xs text-muted-foreground">
            {ar ? "ينتهي في" : "Renews"}{" "}
            {new Date(subscription.current_period_end).toLocaleDateString(ar ? "ar-SA" : "en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        )}
      </div>

      {/* Mode access summary */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider px-1">
          {ar ? "الأوضاع المتاحة" : "Mode Access"}
        </p>
        {[
          { mode: "primary",  label: ar ? "رئيسي"   : "Primary",  always: true },
          { mode: "standard", label: ar ? "استشاري" : "Advisory", paid: true  },
          { mode: "analysis", label: ar ? "تحليلي"  : "Analysis", paid: true  },
        ].map(({ mode, label: lbl, always, paid }) => {
          const hasAccess = always || (paid && (isPaidActive || isTrialActive));
          const modeColor = mode === "primary" ? ACCENT : mode === "standard" ? "#FF8C00" : "#DC143C";
          return (
            <div key={mode} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
              <span className="text-sm text-white">{lbl}</span>
              <span className="text-xs font-medium" style={{ color: hasAccess ? modeColor : "rgba(255,255,255,0.25)" }}>
                {hasAccess ? (ar ? "✓ متاح" : "✓ Active") : (ar ? "محدود" : "Locked")}
              </span>
            </div>
          );
        })}
      </div>

      {isFreeLoggedIn && (
        <button
          onClick={() => navigate("/subscribe")}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors"
          style={{ background: "rgba(0,212,255,0.15)", color: ACCENT, border: `1px solid rgba(0,212,255,0.35)` }}
        >
          {ar ? "ترقية للوصول الكامل" : "Upgrade for Full Access"}
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Settings section
// ════════════════════════════════════════════════════════════════════════════════
function SettingsSection({ lang }: { lang: "ar" | "en" }) {
  const { preferences, loading, updatePreferences } = usePreferences();
  const { language, setLanguage } = useLanguage();
  const ar = lang === "ar";

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">{ar ? "جاري التحميل..." : "Loading..."}</div>;
  }

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider px-1 mt-4 mb-2 first:mt-0">
      {children}
    </p>
  );

  const OptionBtn = ({ value, current, onChange, children }: {
    value: string; current: string; onChange: (v: string) => void; children: React.ReactNode;
  }) => (
    <button
      onClick={() => onChange(value)}
      className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
      style={{
        background: current === value ? "rgba(0,212,255,0.15)" : "rgba(255,255,255,0.05)",
        color: current === value ? ACCENT : "rgba(255,255,255,0.5)",
        border: current === value ? `1px solid rgba(0,212,255,0.3)` : "1px solid transparent",
      }}
    >
      {children}
    </button>
  );

  return (
    <div className="p-4">
      <SectionLabel>{ar ? "اللغة" : "Language"}</SectionLabel>
      <div className="flex gap-2">
        <OptionBtn value="ar" current={language} onChange={(v) => setLanguage(v as "ar" | "en")}>العربية</OptionBtn>
        <OptionBtn value="en" current={language} onChange={(v) => setLanguage(v as "ar" | "en")}>English</OptionBtn>
      </div>

      <SectionLabel>{ar ? "أسلوب الإجابة" : "Output Format"}</SectionLabel>
      <div className="flex gap-2">
        <OptionBtn value="concise"  current={preferences.output_format} onChange={(v) => updatePreferences({ output_format: v as any })}>{ar ? "موجز" : "Concise"}</OptionBtn>
        <OptionBtn value="detailed" current={preferences.output_format} onChange={(v) => updatePreferences({ output_format: v as any })}>{ar ? "مفصّل" : "Detailed"}</OptionBtn>
        <OptionBtn value="report"   current={preferences.output_format} onChange={(v) => updatePreferences({ output_format: v as any })}>{ar ? "تقرير" : "Report"}</OptionBtn>
      </div>

      <SectionLabel>{ar ? "ذاكرة النظام" : "AI Memory"}</SectionLabel>
      <div className="flex gap-2">
        <OptionBtn value="none"       current={preferences.ai_memory_level} onChange={(v) => updatePreferences({ ai_memory_level: v as any })}>{ar ? "بدون" : "None"}</OptionBtn>
        <OptionBtn value="session"    current={preferences.ai_memory_level} onChange={(v) => updatePreferences({ ai_memory_level: v as any })}>{ar ? "جلسة" : "Session"}</OptionBtn>
        <OptionBtn value="persistent" current={preferences.ai_memory_level} onChange={(v) => updatePreferences({ ai_memory_level: v as any })}>{ar ? "دائم" : "Always"}</OptionBtn>
      </div>

      <SectionLabel>{ar ? "المعايير المفضّلة" : "Preferred Standards"}</SectionLabel>
      <div className="space-y-2">
        {(["SBC 201", "SBC 801"] as const).map((std) => {
          const checked = preferences.preferred_standards.includes(std);
          return (
            <button
              key={std}
              onClick={() => {
                const next = checked
                  ? preferences.preferred_standards.filter(s => s !== std)
                  : [...preferences.preferred_standards, std];
                updatePreferences({ preferred_standards: next });
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                background: checked ? "rgba(0,212,255,0.08)" : "rgba(255,255,255,0.03)",
                border: checked ? `1px solid rgba(0,212,255,0.25)` : "1px solid transparent",
                color: checked ? "white" : "rgba(255,255,255,0.5)",
              }}
            >
              <div
                className="w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center"
                style={{ borderColor: checked ? ACCENT : "rgba(255,255,255,0.2)", background: checked ? "rgba(0,212,255,0.2)" : "transparent" }}
              >
                {checked && <CheckCircle className="w-3 h-3" style={{ color: ACCENT }} />}
              </div>
              {std}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Customization section
// ════════════════════════════════════════════════════════════════════════════════
function CustomizationSection({ lang }: { lang: "ar" | "en" }) {
  const ar = lang === "ar";
  const [companyName,    setCompanyName]    = useState(() => localStorage.getItem("cx_company_name")      || "");
  const [reportHeader,   setReportHeader]   = useState(() => localStorage.getItem("cx_report_header")     || "");
  const [reportFooter,   setReportFooter]   = useState(() => localStorage.getItem("cx_report_footer")     || "");
  const [logoDataUrl,    setLogoDataUrl]    = useState(() => localStorage.getItem("cx_company_logo")      || "");
  const [reportStyle,    setReportStyle]    = useState(() => localStorage.getItem("cx_report_style")      || "detailed");
  const [reportLanguage, setReportLanguage] = useState(() => localStorage.getItem("cx_report_language")   || "auto");
  const [printLogo,      setPrintLogo]      = useState(() => localStorage.getItem("cx_print_logo")    !== "false");
  const [printHeader,    setPrintHeader]    = useState(() => localStorage.getItem("cx_print_header")  !== "false");
  const [printFooter,    setPrintFooter]    = useState(() => localStorage.getItem("cx_print_footer")  !== "false");
  const [logoError,      setLogoError]      = useState("");
  const [saved, setSaved] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const COMPANY_NAME_MAX = 60;

  const save = () => {
    localStorage.setItem("cx_company_name",    companyName);
    localStorage.setItem("cx_report_header",   reportHeader);
    localStorage.setItem("cx_report_footer",   reportFooter);
    localStorage.setItem("cx_report_style",    reportStyle);
    localStorage.setItem("cx_report_language", reportLanguage);
    localStorage.setItem("cx_print_logo",      String(printLogo));
    localStorage.setItem("cx_print_header",    String(printHeader));
    localStorage.setItem("cx_print_footer",    String(printFooter));
    if (logoDataUrl) localStorage.setItem("cx_company_logo", logoDataUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError("");
    if (file.size > 500_000) {
      setLogoError(ar ? "الحجم الأقصى 500 كيلوبايت" : "Max logo size is 500 KB");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => setLogoDataUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="text-xs text-muted-foreground mb-1.5">{children}</p>
  );

  const SubsectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider px-1 mb-2 mt-5 first:mt-0">
      {children}
    </p>
  );

  const inputCls = "w-full px-3 py-2 rounded-lg text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:border-[#00D4FF]/40 placeholder:text-muted-foreground/50 transition-colors";

  const OptionBtn = ({ value, current, onChange, children }: {
    value: string; current: string; onChange: (v: string) => void; children: React.ReactNode;
  }) => (
    <button
      onClick={() => onChange(value)}
      className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
      style={{
        background: current === value ? "rgba(0,212,255,0.15)" : "rgba(255,255,255,0.05)",
        color: current === value ? ACCENT : "rgba(255,255,255,0.5)",
        border: current === value ? `1px solid rgba(0,212,255,0.3)` : "1px solid transparent",
      }}
    >
      {children}
    </button>
  );

  const PrintCheckbox = ({
    checked, onChange, children,
  }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
      style={{
        background: checked ? "rgba(0,212,255,0.08)" : "rgba(255,255,255,0.03)",
        border: checked ? `1px solid rgba(0,212,255,0.25)` : "1px solid transparent",
        color: checked ? "white" : "rgba(255,255,255,0.5)",
      }}
    >
      <div
        className="w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center"
        style={{ borderColor: checked ? ACCENT : "rgba(255,255,255,0.2)", background: checked ? "rgba(0,212,255,0.2)" : "transparent" }}
      >
        {checked && <CheckCircle className="w-3 h-3" style={{ color: ACCENT }} />}
      </div>
      {children}
    </button>
  );

  return (
    <div className="p-4 space-y-4">
      {/* Logo */}
      <div>
        <FieldLabel>{ar ? "شعار الشركة" : "Company Logo"}</FieldLabel>
        <div
          className="w-full h-20 rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors hover:bg-white/5"
          style={{ border: `2px dashed rgba(0,212,255,0.2)` }}
          onClick={() => logoRef.current?.click()}
        >
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="Logo" className="h-14 object-contain rounded" />
          ) : (
            <>
              <Upload className="w-5 h-5 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground/60">
                {ar ? "اضغط لرفع الشعار (PNG/SVG)" : "Click to upload logo (PNG/SVG)"}
              </span>
            </>
          )}
        </div>
        <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
        {logoError && (
          <p className="mt-1 text-xs text-red-400">{logoError}</p>
        )}
        {logoDataUrl && (
          <button
            onClick={() => { setLogoDataUrl(""); setLogoError(""); localStorage.removeItem("cx_company_logo"); }}
            className="mt-1 text-xs text-muted-foreground hover:text-red-400 transition-colors"
          >
            {ar ? "إزالة الشعار" : "Remove logo"}
          </button>
        )}
      </div>

      {/* Company name */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <FieldLabel>{ar ? "اسم الشركة / المكتب" : "Company / Office Name"}</FieldLabel>
          <span className="text-xs tabular-nums" style={{ color: companyName.length >= COMPANY_NAME_MAX ? "#ef4444" : "rgba(255,255,255,0.3)" }}>
            {companyName.length}/{COMPANY_NAME_MAX}
          </span>
        </div>
        <input
          className={inputCls}
          value={companyName}
          maxLength={COMPANY_NAME_MAX}
          onChange={e => setCompanyName(e.target.value)}
          placeholder={ar ? "مكتب الاستشارات الهندسية" : "Engineering Consultancy Office"}
          dir={ar ? "rtl" : "ltr"}
        />
      </div>

      {/* Report header */}
      <div>
        <FieldLabel>{ar ? "رأس التقرير" : "Report Header"}</FieldLabel>
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          value={reportHeader}
          onChange={e => setReportHeader(e.target.value)}
          placeholder={ar ? "نص يظهر في رأس التقارير المطبوعة..." : "Text shown at the top of printed reports..."}
          dir={ar ? "rtl" : "ltr"}
        />
      </div>

      {/* Report footer */}
      <div>
        <FieldLabel>{ar ? "تذييل التقرير" : "Report Footer"}</FieldLabel>
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          value={reportFooter}
          onChange={e => setReportFooter(e.target.value)}
          placeholder={ar ? "نص يظهر في تذييل التقارير المطبوعة..." : "Text shown at the bottom of printed reports..."}
          dir={ar ? "rtl" : "ltr"}
        />
      </div>

      {/* Report Style */}
      <div>
        <SubsectionLabel>{ar ? "أسلوب التقرير" : "Report Style"}</SubsectionLabel>
        <div className="flex gap-2">
          <OptionBtn value="detailed" current={reportStyle} onChange={setReportStyle}>
            {ar ? "مفصّل" : "Detailed"}
          </OptionBtn>
          <OptionBtn value="concise" current={reportStyle} onChange={setReportStyle}>
            {ar ? "موجز" : "Concise"}
          </OptionBtn>
          <OptionBtn value="formal" current={reportStyle} onChange={setReportStyle}>
            {ar ? "رسمي" : "Formal"}
          </OptionBtn>
        </div>
        <p className="text-xs text-muted-foreground/50 mt-1.5 leading-relaxed">
          {reportStyle === "formal"
            ? (ar ? "مناسب لوضع التحليل قبل تقديم المشروع للجهة المختصة" : "Best for Analysis mode before authority submission")
            : reportStyle === "concise"
            ? (ar ? "ملخص يركز على النتائج الرئيسية" : "Summary focused on key findings")
            : (ar ? "مخرجات كاملة بجميع الأقسام" : "Full structured output with all sections")}
        </p>
      </div>

      {/* Report Language */}
      <div>
        <SubsectionLabel>{ar ? "لغة التقرير" : "Report Language"}</SubsectionLabel>
        <div className="flex gap-2">
          <OptionBtn value="auto" current={reportLanguage} onChange={setReportLanguage}>
            {ar ? "تلقائي" : "Auto"}
          </OptionBtn>
          <OptionBtn value="ar" current={reportLanguage} onChange={setReportLanguage}>
            العربية
          </OptionBtn>
          <OptionBtn value="en" current={reportLanguage} onChange={setReportLanguage}>
            English
          </OptionBtn>
        </div>
      </div>

      {/* Print & Export */}
      <div>
        <SubsectionLabel>{ar ? "الطباعة والتصدير" : "Print & Export"}</SubsectionLabel>
        <div className="space-y-2">
          <PrintCheckbox checked={printLogo} onChange={setPrintLogo}>
            {ar ? "تضمين الشعار عند الطباعة" : "Include company logo in print"}
          </PrintCheckbox>
          <PrintCheckbox checked={printHeader} onChange={setPrintHeader}>
            {ar ? "تضمين رأس التقرير عند الطباعة" : "Include report header in print"}
          </PrintCheckbox>
          <PrintCheckbox checked={printFooter} onChange={setPrintFooter}>
            {ar ? "تضمين تذييل التقرير عند الطباعة" : "Include report footer in print"}
          </PrintCheckbox>
        </div>
      </div>

      <p className="text-xs text-muted-foreground/60 leading-relaxed">
        {ar
          ? "تُستخدم هذه المعلومات في تنسيق التقارير المُصدَّرة. يتم حفظها محلياً على جهازك فقط."
          : "Used for formatting exported reports. Stored locally on this device only."}
      </p>

      {/* Save */}
      <button
        onClick={save}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
        style={{
          background: saved ? "rgba(34,197,94,0.15)" : "rgba(0,212,255,0.15)",
          color: saved ? "#22c55e" : ACCENT,
          border: saved ? "1px solid rgba(34,197,94,0.3)" : `1px solid rgba(0,212,255,0.35)`,
        }}
      >
        {saved
          ? (ar ? "✓ تم الحفظ" : "✓ Saved")
          : (ar ? "حفظ الإعدادات" : "Save Settings")}
      </button>
    </div>
  );
}
