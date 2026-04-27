/**
 * E7.10A — Public case tracking page.
 *
 * Route: /track/:token
 * Renders read-only, login-free case status for external clients.
 * Calls the get-public-case-tracking edge function with the URL token.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, Building2, CheckCircle2, Clock, ExternalLink, FileText, Loader2, MapPin, Phone, ShieldAlert, User2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PublicTrackingPayload {
  organization: { name: string | null };
  branding: {
    logo_url: string | null;
    header_ar: string | null;
    header_en: string | null;
    primary_color: string | null;
    secondary_color: string | null;
  };
  case: {
    case_number: string;
    public_title: string;
    public_summary: string | null;
    status_public_label_ar: string;
    status_public_label_en: string;
    progress_percent: number | null;
    last_published_at: string | null;
  };
  assigned_engineer: {
    display_name: string | null;
    role_title_ar: string | null;
    role_title_en: string | null;
  } | null;
  updates: Array<{
    id: string;
    title_ar: string;
    title_en: string | null;
    body_ar: string | null;
    body_en: string | null;
    public_status: string;
    public_status_label_ar: string;
    public_status_label_en: string;
    progress_percent: number | null;
    client_action_required: boolean;
    published_at: string;
  }>;
  client_action_required: boolean;
  latest_required_action: {
    title_ar: string;
    title_en: string | null;
    action_ar: string | null;
    action_en: string | null;
    published_at: string;
  } | null;
}

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; data: PublicTrackingPayload }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export default function PublicCaseTracking() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  // The portal is Arabic-first. A small toggle flips to EN if a returned label
  // is non-empty — but we always render AR primarily.
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const ar = lang === "ar";

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState({ kind: "missing" });
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-public-case-tracking", {
          body: { token },
        });
        if (cancelled) return;
        if (error) {
          // Non-200: treat as missing rather than surface internal details.
          setState({ kind: "missing" });
          return;
        }
        // Edge function returns 404 with `{ error: "Not found" }` on missing/disabled.
        if (data && typeof data === "object" && "error" in data) {
          setState({ kind: "missing" });
          return;
        }
        setState({ kind: "ready", data: data as PublicTrackingPayload });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const accent = useMemo(() => {
    if (state.kind !== "ready") return { primary: "#2563eb", secondary: "#0ea5e9" };
    const b = state.data.branding;
    return {
      primary: b.primary_color || "#2563eb",
      secondary: b.secondary_color || "#0ea5e9",
    };
  }, [state]);

  if (state.kind === "loading") {
    return <CenteredCard ar={ar} icon={<Loader2 className="w-7 h-7 animate-spin text-primary" />} title={ar ? "جارٍ تحميل تتبع المعاملة…" : "Loading case tracking…"} />;
  }
  if (state.kind === "missing") {
    return (
      <CenteredCard
        ar={ar}
        icon={<ShieldAlert className="w-7 h-7 text-red-400" />}
        title={ar ? "تعذّر العثور على هذه المعاملة" : "Tracking link not available"}
        subtitle={ar
          ? "قد يكون الرابط منتهي الصلاحية أو تم تعطيله من قِبَل المكتب."
          : "This tracking link may have expired or been disabled by the office."}
      />
    );
  }
  if (state.kind === "error") {
    return (
      <CenteredCard
        ar={ar}
        icon={<AlertCircle className="w-7 h-7 text-amber-400" />}
        title={ar ? "حدث خطأ أثناء تحميل المعاملة" : "Could not load case"}
        subtitle={ar ? "يرجى المحاولة لاحقًا." : "Please try again later."}
      />
    );
  }

  const d = state.data;
  const lastPublished = d.case.last_published_at
    ? new Date(d.case.last_published_at).toLocaleString(ar ? "ar-SA" : "en-US", {
        dateStyle: "medium", timeStyle: "short",
      })
    : null;

  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      {/* Header */}
      <header className="border-b border-white/5 bg-slate-950/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-4">
          {d.branding.logo_url ? (
            <img src={d.branding.logo_url} alt="" className="w-12 h-12 rounded-md object-contain bg-white/5" />
          ) : (
            <div className="w-12 h-12 rounded-md bg-white/5 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-slate-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold truncate">
              {d.organization.name || (ar ? "المؤسسة" : "Organization")}
            </p>
            <p className="text-xs text-slate-400 truncate">
              {ar ? d.branding.header_ar ?? "" : d.branding.header_en ?? ""}
            </p>
          </div>
          <button
            onClick={() => setLang(ar ? "en" : "ar")}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-white/10 hover:bg-white/5 transition"
          >
            {ar ? "EN" : "ع"}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Status hero */}
        <section
          className="rounded-2xl border border-white/10 p-6 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${accent.primary}22, ${accent.secondary}11)`,
          }}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                {ar ? "رقم المعاملة" : "Case number"}
              </p>
              <p className="text-lg font-mono font-semibold text-slate-100">{d.case.case_number}</p>
              <h1 className="text-xl sm:text-2xl font-bold mt-3 leading-snug">
                {d.case.public_title}
              </h1>
              {d.case.public_summary && (
                <p className="text-sm text-slate-300/90 mt-2 leading-relaxed">{d.case.public_summary}</p>
              )}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border"
                style={{
                  borderColor: `${accent.primary}66`,
                  background: `${accent.primary}22`,
                  color: "#fff",
                }}
              >
                {ar ? d.case.status_public_label_ar : d.case.status_public_label_en}
              </span>
              {d.case.progress_percent !== null && (
                <span className="text-sm font-semibold text-slate-200 tabular-nums">
                  {d.case.progress_percent}%
                </span>
              )}
            </div>
            {d.case.progress_percent !== null && (
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, d.case.progress_percent))}%`,
                    background: `linear-gradient(90deg, ${accent.primary}, ${accent.secondary})`,
                  }}
                />
              </div>
            )}
          </div>

          {lastPublished && (
            <p className="text-[11px] text-slate-400 mt-4 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {ar ? "آخر تحديث:" : "Last updated:"} {lastPublished}
            </p>
          )}
        </section>

        {/* Required client action */}
        {d.client_action_required && d.latest_required_action && (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-200">
                  {ar ? "إجراء مطلوب من العميل" : "Action required from client"}
                </p>
                {(ar ? d.latest_required_action.action_ar : d.latest_required_action.action_en) && (
                  <p className="text-sm text-amber-100/90 mt-1 leading-relaxed">
                    {ar ? d.latest_required_action.action_ar : d.latest_required_action.action_en}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Timeline */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-slate-400" />
            {ar ? "تحديثات المعاملة" : "Case updates"}
          </h2>
          {d.updates.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">
              {ar ? "لا توجد تحديثات منشورة بعد." : "No published updates yet."}
            </p>
          ) : (
            <ol className="relative ms-2 space-y-4 border-s border-white/10 ps-4">
              {d.updates.map((u, i) => {
                const ts = new Date(u.published_at).toLocaleString(ar ? "ar-SA" : "en-US", {
                  dateStyle: "medium", timeStyle: "short",
                });
                const title = ar ? u.title_ar : (u.title_en || u.title_ar);
                const body = ar ? u.body_ar : (u.body_en || u.body_ar);
                return (
                  <li key={u.id} className="relative">
                    <span
                      className="absolute -start-[21px] top-1.5 w-2.5 h-2.5 rounded-full"
                      style={{ background: i === 0 ? accent.primary : "#475569" }}
                    />
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-xs px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-slate-300">
                        {ar ? u.public_status_label_ar : u.public_status_label_en}
                      </span>
                      {u.progress_percent !== null && (
                        <span className="text-[11px] text-slate-400 tabular-nums">{u.progress_percent}%</span>
                      )}
                      <span className="text-[11px] text-slate-500 ms-auto">{ts}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-100 mt-1.5">{title}</p>
                    {body && <p className="text-sm text-slate-300/90 mt-1 leading-relaxed whitespace-pre-line">{body}</p>}
                    {u.client_action_required && (
                      <p className="text-xs text-amber-300 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {ar ? "إجراء مطلوب" : "Action required"}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Engineer card (only when explicitly enabled by office) */}
        {d.assigned_engineer && d.assigned_engineer.display_name && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-3">
              <User2 className="w-4 h-4 text-slate-400" />
              {ar ? "المهندس المسؤول" : "Assigned engineer"}
            </h2>
            <div>
              <p className="text-base font-semibold text-slate-100">{d.assigned_engineer.display_name}</p>
              {(ar ? d.assigned_engineer.role_title_ar : d.assigned_engineer.role_title_en) && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {ar ? d.assigned_engineer.role_title_ar : d.assigned_engineer.role_title_en}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center pt-2 pb-6">
          <a
            href="https://www.consultx.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-slate-500 hover:text-slate-300 transition inline-flex items-center gap-1"
          >
            {ar ? "بدعم من" : "Powered by"} ConsultX
            <ExternalLink className="w-3 h-3" />
          </a>
        </footer>
      </main>
    </div>
  );
}

function CenteredCard({
  ar, icon, title, subtitle,
}: { ar: boolean; icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 max-w-md w-full p-8 text-center">
        <div className="flex justify-center mb-3">{icon}</div>
        <h1 className="text-base font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400 mt-2 leading-relaxed">{subtitle}</p>}
      </div>
    </div>
  );
}
