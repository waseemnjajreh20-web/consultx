import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, User as UserIcon, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import MemberAvatar from "@/components/MemberAvatar";
import { initialsFromName } from "@/lib/memberDisplay";

const trimOrNull = (s: string): string | null => {
  const t = s.trim();
  return t.length > 0 ? t : null;
};

export default function Profile() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { toast } = useToast();
  const ar = language === "ar";

  const {
    myPublicProfile,
    myPublicProfileLoading,
    upsertMyPublicProfile,
    refetchMyPublicProfile,
  } = useOrganization();

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<"ar" | "en">("ar");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (myPublicProfile && !hydrated) {
      setDisplayName(myPublicProfile.display_name ?? "");
      setAvatarUrl(myPublicProfile.avatar_url ?? "");
      setJobTitle(myPublicProfile.job_title ?? "");
      setPhone(myPublicProfile.phone ?? "");
      setBio(myPublicProfile.bio ?? "");
      setPreferredLanguage(myPublicProfile.preferred_language ?? "ar");
      setHydrated(true);
    } else if (!myPublicProfileLoading && !myPublicProfile && !hydrated) {
      // No row yet — seed preferred_language from current UI language.
      setPreferredLanguage(language === "ar" ? "ar" : "en");
      setHydrated(true);
    }
  }, [myPublicProfile, myPublicProfileLoading, hydrated, language]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedAvatar = avatarUrl.trim();
    if (trimmedAvatar) {
      try {
        // eslint-disable-next-line no-new
        new URL(trimmedAvatar);
      } catch {
        toast({
          title: ar ? "رابط غير صالح" : "Invalid avatar URL",
          description: ar ? "أدخل رابطاً صحيحاً يبدأ بـ https://" : "Enter a valid URL starting with https://",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      await upsertMyPublicProfile.mutateAsync({
        display_name: trimOrNull(displayName),
        avatar_url: trimOrNull(avatarUrl),
        job_title: trimOrNull(jobTitle),
        phone: trimOrNull(phone),
        bio: trimOrNull(bio),
        preferred_language: preferredLanguage,
      });
      // Sync the current UI language with the saved preference so the next
      // navigation reflects the user's choice without a hard refresh.
      if (preferredLanguage !== language) {
        setLanguage(preferredLanguage);
      }
      toast({ title: ar ? "تم حفظ الملف الشخصي" : "Profile saved" });
      refetchMyPublicProfile();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: ar ? "خطأ" : "Error", description: msg, variant: "destructive" });
    }
  };

  if (authLoading || (!hydrated && myPublicProfileLoading)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const displayedName = displayName.trim() || user?.email || "?";
  const initials = initialsFromName(displayedName);
  const BackIcon = ar ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-dvh bg-background" dir={ar ? "rtl" : "ltr"}>
      <header className="border-b border-border/40 bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
            <BackIcon className="w-4 h-4" />
            {ar ? "رجوع" : "Back"}
          </Button>
          <div className="ms-2">
            <h1 className="text-base font-semibold flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-primary" />
              {ar ? "الملف الشخصي" : "Profile"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {ar
                ? "كيف يظهر اسمك وصورتك في المحادثات والتقارير."
                : "How your name and avatar appear in chats and reports."}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar preview + URL */}
          <section className="bg-card/60 border border-border/40 rounded-xl p-5 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            <MemberAvatar
              src={avatarUrl.trim() || null}
              initials={initials}
              size="xl"
              alt={displayedName}
            />
            <div className="flex-1 w-full space-y-1.5">
              <Label htmlFor="avatar-url" className="text-xs">
                {ar ? "رابط الصورة الشخصية" : "Avatar URL"}
              </Label>
              <Input
                id="avatar-url"
                type="url"
                inputMode="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
                dir="ltr"
                maxLength={2000}
              />
              <p className="text-[11px] text-muted-foreground/70">
                {ar
                  ? "ضع رابطاً مباشراً للصورة. يُفضّل صور مربعة بحجم 200×200 أو أعلى."
                  : "Paste a direct image URL. Square images at 200×200 or larger work best."}
              </p>
            </div>
          </section>

          {/* Identity */}
          <section className="bg-card/60 border border-border/40 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold">
              {ar ? "هويتك العامة" : "Your public identity"}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="display-name" className="text-xs">
                  {ar ? "الاسم المعروض" : "Display name"}
                </Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={ar ? "مثال: م. أحمد المالك" : "e.g. Eng. Ahmad Al-Malek"}
                  maxLength={120}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="job-title" className="text-xs">
                  {ar ? "المسمى الوظيفي" : "Job title"}
                </Label>
                <Input
                  id="job-title"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder={ar ? "مثال: مهندس أول" : "e.g. Senior Engineer"}
                  maxLength={120}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs">
                  {ar ? "رقم التواصل" : "Phone"}
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={ar ? "+966 5x xxx xxxx" : "+966 5x xxx xxxx"}
                  dir="ltr"
                  maxLength={32}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  {ar ? "البريد الإلكتروني" : "Email"}
                </Label>
                <Input value={user?.email ?? ""} disabled dir="ltr" />
                <p className="text-[11px] text-muted-foreground/70">
                  {ar ? "لا يمكن تعديل البريد من هنا." : "Email cannot be changed from this page."}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bio" className="text-xs">
                {ar ? "نبذة تعريفية" : "Bio"}
              </Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                placeholder={ar ? "تعريف مختصر يظهر للأعضاء داخل المؤسسة" : "Short description visible to members of your organization"}
                maxLength={1000}
              />
              <p className="text-[11px] text-muted-foreground/70 text-end">
                {bio.length}/1000
              </p>
            </div>
          </section>

          {/* Language preference */}
          <section className="bg-card/60 border border-border/40 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold">
              {ar ? "لغة الواجهة المفضّلة" : "Preferred interface language"}
            </h2>
            <p className="text-xs text-muted-foreground/80">
              {ar
                ? "تُستخدم هذه اللغة افتراضياً عند تسجيل الدخول من جهاز جديد."
                : "This language is used by default when you sign in from a new device."}
            </p>
            <div className="flex gap-2">
              {(["ar", "en"] as const).map((opt) => {
                const active = preferredLanguage === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setPreferredLanguage(opt)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      active
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-card border-border/40 text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    {opt === "ar" ? "العربية" : "English"}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)} disabled={upsertMyPublicProfile.isPending}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={upsertMyPublicProfile.isPending} className="gap-2">
              {upsertMyPublicProfile.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {ar ? "حفظ التغييرات" : "Save changes"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
