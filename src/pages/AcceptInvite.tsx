import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Building2, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useLanguage } from "@/hooks/useLanguage";

type State =
  | { phase: "loading" }
  | { phase: "requires_auth" }
  | { phase: "accepting" }
  | { phase: "success"; orgId: string }
  | { phase: "error"; message: string };

const ERROR_MAP: Record<string, { ar: string; en: string }> = {
  "Invitation not found or token is invalid": {
    ar: "رابط الدعوة غير صالح أو منتهي الصلاحية.",
    en: "Invitation link is invalid or has already been used.",
  },
  "Invitation is accepted": {
    ar: "هذه الدعوة قُبِلت مسبقًا.",
    en: "This invitation has already been accepted.",
  },
  "Invitation is revoked": {
    ar: "تم إلغاء هذه الدعوة من قِبَل المؤسسة.",
    en: "This invitation was revoked by the organization.",
  },
  "Invitation is expired": {
    ar: "انتهت صلاحية هذه الدعوة.",
    en: "This invitation has expired.",
  },
  "Invitation has expired": {
    ar: "انتهت صلاحية هذه الدعوة.",
    en: "This invitation has expired.",
  },
  "does not match the invitation email": {
    ar: "بريدك الإلكتروني لا يطابق بريد الدعوة. سجّل الدخول بالبريد الصحيح.",
    en: "Your account email does not match the invitation email. Sign in with the correct email.",
  },
  "already belong to an organization": {
    ar: "أنت بالفعل عضو في مؤسسة ولا يمكنك الانضمام لأخرى.",
    en: "You already belong to an organization and cannot accept another invitation.",
  },
  "Not authenticated": {
    ar: "يلزم تسجيل الدخول أولًا.",
    en: "You must be signed in to accept an invitation.",
  },
};

function localizeError(msg: string, ar: boolean): string {
  for (const [key, value] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return ar ? value.ar : value.en;
  }
  return msg;
}

export default function AcceptInvite() {
  const { language } = useLanguage();
  const ar = language === "ar";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const { user, authLoading } = useEntitlement();
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    if (authLoading) return;

    if (!token) {
      setState({ phase: "error", message: ar ? "رابط الدعوة غير صالح — لا يوجد رمز." : "Invalid invitation link — no token present." });
      return;
    }

    if (!user) {
      setState({ phase: "requires_auth" });
      return;
    }

    // User is authenticated — accept immediately.
    setState({ phase: "accepting" });
    supabase
      .rpc("accept_org_invitation", { p_token: token })
      .then(({ data, error }) => {
        if (error) {
          setState({ phase: "error", message: localizeError(error.message, ar) });
        } else {
          setState({ phase: "success", orgId: data as string });
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, token]);

  const handleSignIn = () => {
    // Preserve token across the auth redirect so we can re-process after sign-in.
    navigate(`/auth?redirect=/accept-invite?token=${encodeURIComponent(token)}`);
  };

  return (
    <div
      className="min-h-dvh flex items-center justify-center bg-background p-6"
      dir={ar ? "rtl" : "ltr"}
    >
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-2">
          <Building2 className="w-10 h-10 mx-auto text-primary" />
          <h1 className="text-xl font-semibold">
            {ar ? "دعوة للانضمام لمؤسسة" : "Organization Invitation"}
          </h1>
        </div>

        {/* Loading / processing */}
        {(state.phase === "loading" || state.phase === "accepting") && (
          <div className="rounded-xl border border-border/40 bg-card/40 p-6 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {state.phase === "accepting"
                ? (ar ? "جارٍ قبول الدعوة…" : "Accepting invitation…")
                : (ar ? "جارٍ التحقق…" : "Verifying…")}
            </p>
          </div>
        )}

        {/* Requires auth */}
        {state.phase === "requires_auth" && (
          <div className="rounded-xl border border-border/40 bg-card/40 p-6 space-y-4">
            <p className="text-sm text-center leading-relaxed">
              {ar
                ? "يلزم تسجيل الدخول لقبول الدعوة. تأكد من استخدام البريد الإلكتروني المُدعَو."
                : "You need to sign in to accept this invitation. Make sure to use the invited email address."}
            </p>
            <Button className="w-full" onClick={handleSignIn}>
              {ar ? "تسجيل الدخول / إنشاء حساب" : "Sign in / Create account"}
            </Button>
          </div>
        )}

        {/* Success */}
        {state.phase === "success" && (
          <div
            className="rounded-xl p-6 space-y-4"
            style={{
              background: "linear-gradient(180deg, rgba(34,197,94,0.10) 0%, rgba(34,197,94,0.02) 100%)",
              border: "1px solid rgba(34,197,94,0.30)",
            }}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              <p className="text-base font-semibold">
                {ar ? "تم قبول الدعوة والانضمام للمؤسسة" : "Invitation accepted — you've joined the organization"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {ar
                  ? "أنت الآن عضو نشط. يمكنك فتح مساحة العمل المؤسسية."
                  : "You are now an active member. Open the enterprise workspace to get started."}
              </p>
            </div>
            <Button className="w-full" onClick={() => navigate("/enterprise")}>
              {ar ? "فتح مساحة العمل المؤسسية" : "Open Enterprise Workspace"}
            </Button>
          </div>
        )}

        {/* Error */}
        {state.phase === "error" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-red-300">
                  {ar ? "تعذّر قبول الدعوة" : "Could not accept invitation"}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {state.message}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/enterprise">
                  {ar ? "فتح مساحة العمل" : "Open workspace"}
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/">
                  {ar ? "الصفحة الرئيسية" : "Home"}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
