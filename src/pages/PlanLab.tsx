/**
 * PlanLab page — hidden, admin-only experimental workspace.
 *
 * Gate semantics:
 *   - While auth/entitlement is resolving       → LoadingSpinner
 *   - Anonymous, non-admin, or flag disabled    → NotFound (no redirect, no leak)
 *   - Admin AND flag enabled, no iframe URL     → empty state with env panel
 *   - Admin AND flag enabled, iframe URL set    → sandboxed iframe
 *
 * Phase 3 adds the sandboxed iframe path and a postMessage listener scaffold.
 * The listener filters strictly on `event.origin === planLabConfig.iframeOrigin`,
 * logs accepted events to `console.debug` only when `import.meta.env.DEV`, and
 * does not yet parse payloads — payload validation is Phase 5.
 */
import { useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Bell,
  BellRing,
  BookOpen,
  Box,
  DoorOpen,
  Flame,
  Hand,
  Navigation,
  type LucideIcon,
} from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEntitlement } from "@/hooks/useEntitlement";
import { planLabConfig } from "@/lib/plan-lab/planLabConfig";
import { parsePlanLabMessage } from "@/lib/plan-lab/planLabMessages";
import type {
  EvidenceStatus,
  OverlayCategory,
  PlanLabFlagState,
} from "@/types/planLab";
import NotFound from "./NotFound";

// ---------------------------------------------------------------------------
// Phase 7 — Fire Safety Overlay V1 legend metadata.
//
// Read-only display vocabulary. The icons come from lucide-react (already a
// project dependency — no new packages introduced). Colour classes use
// Tailwind utility tokens that are present in the existing config.
// ---------------------------------------------------------------------------

interface CategoryRow {
  kind: OverlayCategory;
  icon: LucideIcon;
  labelAr: string;
  labelEn: string;
}

const OVERLAY_CATEGORIES: readonly CategoryRow[] = [
  { kind: "fire_alarm_detector", icon: BellRing,       labelAr: "كاشف إنذار حريق",     labelEn: "Fire alarm detector" },
  { kind: "manual_call_point",   icon: Hand,           labelAr: "نقطة إنذار يدوي",     labelEn: "Manual call point"   },
  { kind: "alarm_bell",          icon: Bell,           labelAr: "جرس إنذار",           labelEn: "Alarm bell"          },
  { kind: "fire_extinguisher",   icon: Flame,          labelAr: "طفاية حريق",          labelEn: "Fire extinguisher"   },
  { kind: "fire_hose_cabinet",   icon: Box,            labelAr: "خزانة خرطوم حريق",    labelEn: "Fire hose cabinet"   },
  { kind: "emergency_exit",      icon: DoorOpen,       labelAr: "مخرج طوارئ",          labelEn: "Emergency exit"      },
  { kind: "egress_path",         icon: Navigation,     labelAr: "مسار إخلاء",          labelEn: "Egress path"         },
  { kind: "warning",             icon: AlertTriangle,  labelAr: "تحذير",               labelEn: "Warning"             },
  { kind: "code_finding",        icon: BookOpen,       labelAr: "مخالفة كود",          labelEn: "Code finding"        },
];

interface EvidenceStatusRow {
  status: EvidenceStatus;
  labelAr: string;
  labelEn: string;
  swatchClass: string;
}

const EVIDENCE_STATUSES: readonly EvidenceStatusRow[] = [
  {
    status: "visible_only",
    labelAr: "مرئي فقط",
    labelEn: "Visible only",
    swatchClass: "bg-emerald-500/30 border-emerald-500/60",
  },
  {
    status: "source_backed",
    labelAr: "موثّق بمصدر",
    labelEn: "Source-backed",
    swatchClass: "bg-sky-500/30 border-sky-500/60",
  },
  {
    status: "inferred",
    labelAr: "مستنتج",
    labelEn: "Inferred",
    swatchClass: "bg-amber-500/30 border-amber-500/60",
  },
  {
    status: "missing",
    labelAr: "مفقود",
    labelEn: "Missing",
    swatchClass: "bg-red-500/30 border-red-500/60",
  },
  {
    status: "conflict",
    labelAr: "تعارض",
    labelEn: "Conflict",
    swatchClass: "bg-orange-500/30 border-orange-500/60",
  },
];

function resolveFlagState(args: {
  isLoading: boolean;
  user: unknown;
  isAdmin: boolean;
  enabled: boolean;
}): PlanLabFlagState {
  if (args.isLoading) return "loading";
  if (!args.enabled) return "disabled";
  if (!args.user) return "anonymous";
  if (!args.isAdmin) return "non_admin";
  return "enabled";
}

function PlanLabHeader({ compact }: { compact: boolean }) {
  return (
    <header className={compact ? "space-y-1 text-right" : "space-y-2 text-right"}>
      <div className="flex items-center justify-end gap-2">
        <Badge variant="outline" className="text-xs">
          تجريبي · Experimental
        </Badge>
        <Badge variant="secondary" className="text-xs">
          Phase 7
        </Badge>
      </div>
      <h1 className={compact ? "text-xl font-semibold tracking-tight" : "text-3xl font-bold tracking-tight"}>
        مختبر المخططات
      </h1>
      {!compact && (
        <p className="text-sm text-muted-foreground">
          Plan Lab — fire-safety plan intelligence workspace
        </p>
      )}
    </header>
  );
}

function PlanLabEmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-right">حالة التشغيل</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-right">
        <p className="text-sm leading-relaxed text-muted-foreground">
          هذه مساحة عمل تجريبية معزولة لاستكشاف ربط محرر مخططات خارجي
          بمنصة ConsultX. لا تتصل بقواعد البيانات أو الفواتير أو أي
          مكوّن إنتاجي. الوصول مقتصر على المسؤولين، ومخفي خلف علم تشغيل.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground" dir="ltr">
          An isolated experimental workspace for evaluating an external plan
          editor against ConsultX. No database, billing, or production
          feature is touched. Admin-only, hidden behind a runtime flag.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 pt-2">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-right">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              VITE_PLAN_LAB_ENABLED
            </div>
            <div className="mt-1 font-mono text-sm">
              {planLabConfig.enabled ? "true" : "false"}
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3 text-right">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              VITE_PLAN_LAB_IFRAME_URL
            </div>
            <div className="mt-1 font-mono text-sm break-all" dir="ltr">
              {planLabConfig.iframeUrl ?? "—"}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-dashed border-border bg-background p-4 text-right">
          <div className="text-xs font-medium text-muted-foreground">
            المرحلة القادمة · Next phase
          </div>
          <p className="mt-1 text-sm leading-relaxed">
            عندما يُضبط
            <span className="mx-1 font-mono">VITE_PLAN_LAB_IFRAME_URL</span>
            على عنوان صالح، يُحمَّل المحرر الخارجي داخل iframe معزول. مخرجات
            المحرر تُحوَّل إلى نموذج
            <span className="mx-1 font-mono">ConsultXPlanModel</span>
            ثم تُعرض كطبقة سلامة (انظر المفردات أدناه).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function PlanLabOverlayLegend() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-right">مفردات طبقة السلامة · Fire Safety Overlay Vocabulary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 text-right">
        <p className="text-sm leading-relaxed text-muted-foreground">
          هذه هي الفئات التسع لطبقة السلامة وحالات الدليل الخمس التي تُلوّن
          العلامات على المخطط. الطبقة للعرض فقط في هذه المرحلة.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground" dir="ltr">
          These are the nine overlay categories and five evidence statuses that
          colour markers on the plan. Read-only in this phase.
        </p>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">الفئات · Categories</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {OVERLAY_CATEGORIES.map(({ kind, icon: Icon, labelAr, labelEn }) => (
              <div
                key={kind}
                className="flex items-center gap-3 rounded-md border border-border bg-muted/20 p-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1 text-right">
                  <div className="truncate text-sm font-medium">{labelAr}</div>
                  <div className="truncate text-xs text-muted-foreground" dir="ltr">
                    {labelEn}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70" dir="ltr">
                    {kind}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">حالة الدليل · Evidence status</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {EVIDENCE_STATUSES.map(({ status, labelAr, labelEn, swatchClass }) => (
              <div
                key={status}
                className="flex items-center gap-3 rounded-md border border-border bg-muted/20 p-3"
              >
                <div
                  className={`h-4 w-4 shrink-0 rounded-full border ${swatchClass}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 text-right">
                  <div className="truncate text-sm font-medium">{labelAr}</div>
                  <div className="truncate text-xs text-muted-foreground" dir="ltr">
                    {labelEn}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70" dir="ltr">
                    {status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function PlanLabIframe({ src, origin }: { src: string; origin: string }) {
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Origin pin runs first — every other check is below this line.
      if (event.origin !== origin) return;
      const parsed = parsePlanLabMessage(event.data);
      if (!planLabConfig.devLogging) return;
      if (parsed === null) {
        // eslint-disable-next-line no-console
        console.warn("[PlanLab/postMessage] dropped malformed or unknown-type message", {
          origin: event.origin,
          data: event.data,
        });
        return;
      }
      // eslint-disable-next-line no-console
      console.debug(`[PlanLab/postMessage] ${parsed.type}`, parsed.payload);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [origin]);

  return (
    <div className="rounded-md border border-border bg-muted/20 overflow-hidden">
      <iframe
        src={src}
        title="Plan Lab editor"
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
        referrerPolicy="no-referrer"
        loading="lazy"
        allow="clipboard-read; clipboard-write; fullscreen"
        className="block w-full h-[calc(100vh-120px)] bg-background"
      />
      <div className="px-3 py-2 text-[11px] text-muted-foreground font-mono break-all" dir="ltr">
        origin: {origin}
      </div>
    </div>
  );
}

export default function PlanLab() {
  const { user, isAdmin, isLoading } = useEntitlement();

  const flagState = useMemo<PlanLabFlagState>(
    () =>
      resolveFlagState({
        isLoading,
        user,
        isAdmin,
        enabled: planLabConfig.enabled,
      }),
    [isLoading, user, isAdmin]
  );

  if (flagState === "loading") return <LoadingSpinner />;
  if (flagState !== "enabled") return <NotFound />;

  const showIframe =
    planLabConfig.iframeUrl !== null && planLabConfig.iframeOrigin !== null;

  return (
    <div className="min-h-screen bg-background py-6 px-4" dir="rtl">
      <div className="mx-auto max-w-5xl space-y-4">
        <PlanLabHeader compact={showIframe} />
        {showIframe ? (
          <PlanLabIframe
            src={planLabConfig.iframeUrl as string}
            origin={planLabConfig.iframeOrigin as string}
          />
        ) : (
          <>
            <PlanLabEmptyState />
            <PlanLabOverlayLegend />
          </>
        )}
      </div>
    </div>
  );
}
