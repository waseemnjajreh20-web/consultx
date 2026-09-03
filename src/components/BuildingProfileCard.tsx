/**
 * BuildingProfileCard.tsx — compact "بيانات المبنى" summary chip for the
 * chat header, gated behind BUILDING_PROFILE_UI (src/lib/featureFlags.ts).
 * Renders only when a conversation is open. Clicking it opens an edit
 * dialog backed by src/lib/buildingProfile.ts (validateBuildingProfile,
 * profileCompleteness, suggestProfileFromText) and persisted to
 * public.building_profiles (docs/db/20260903_building_profiles.sql,
 * already applied in production; owner-scoped RLS — this component talks
 * to Supabase as the signed-in user, same as every other client query in
 * this app).
 *
 * Persistence note: the row has no unique constraint on
 * (user_id, conversation_id) — only a plain index (see the SQL doc) — so a
 * raw `.upsert(..., {onConflict: "user_id,conversation_id"})` would either
 * error (no matching constraint) or silently misbehave. Instead this reads
 * the row on open (capturing its `id` when one exists) and then either
 * `.update()`s that id or `.insert()`s a new row — an application-level
 * upsert keyed by (user_id, conversation_id), backed by the id already in
 * state rather than a DB constraint that doesn't exist.
 *
 * Test-import note: this file's async handlers import the Supabase client
 * LAZILY (`await import("@/integrations/supabase/client")`) instead of at
 * module top level. That client module reads the bare `localStorage`
 * global at construction time, which is undefined under this repo's
 * Vitest config (`environment: "node"`, see vitest.config.ts) — a
 * top-level `import { supabase } from "@/integrations/supabase/client"`
 * here would make src/__tests__/buildingProfileCard.test.ts throw on
 * import before a single assertion runs. Deferring the import means the
 * pure helpers below (exported for that test file) load with zero
 * side effects; the real client is only ever touched at runtime, in the
 * browser, when a handler actually fires.
 */
import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Wand2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  validateBuildingProfile,
  profileCompleteness,
  suggestProfileFromText,
  OCCUPANCY_GROUPS,
  CONSTRUCTION_TYPES,
  type BuildingProfile,
  type BuildingProfileInput,
  type OccupancyGroup,
  type ConstructionType,
} from "@/lib/buildingProfile";

async function getSupabaseClient() {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — no React, no Supabase. Exported for
// src/__tests__/buildingProfileCard.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_LABELS_AR: Record<string, string> = {
  name: "اسم المبنى",
  occupancy_group: "تصنيف الإشغال",
  stories: "عدد الطوابق",
  height_m: "الارتفاع",
  gross_area_m2: "المساحة الإجمالية",
  sprinklered: "مرشات الحريق",
  construction_type: "نوع الإنشاء",
  hazard_class: "تصنيف الخطورة",
  occupant_load: "عدد الشاغلين المصمَّم",
  notes: "ملاحظات",
};

const FIELD_LABELS_EN: Record<string, string> = {
  name: "Building name",
  occupancy_group: "Occupancy group",
  stories: "Stories",
  height_m: "Height",
  gross_area_m2: "Gross area",
  sprinklered: "Sprinklers",
  construction_type: "Construction type",
  hazard_class: "Hazard classification",
  occupant_load: "Design occupant load",
  notes: "Notes",
};

/** Arabic/English label for a BuildingProfile field key; falls back to the raw key for an unknown one. */
export function fieldLabel(key: string, isAr: boolean): string {
  return (isAr ? FIELD_LABELS_AR : FIELD_LABELS_EN)[key] ?? key;
}

/**
 * Human-readable rendering of one suggested field's value, unit-aware
 * (height in m, area in m², sprinklered as a yes/no phrase).
 */
export function formatSuggestedValue(key: string, value: unknown, isAr: boolean): string {
  if (value === null || value === undefined) return "—";
  if (key === "sprinklered") return value ? (isAr ? "مرشات مركّبة" : "sprinklered") : (isAr ? "لا توجد مرشات" : "not sprinklered");
  if (key === "height_m") return `${value} ${isAr ? "م" : "m"}`;
  if (key === "gross_area_m2") return `${value} ${isAr ? "م²" : "m²"}`;
  return String(value);
}

/**
 * true when `current` is an already-confirmed value (not empty/unset) AND
 * it differs from `suggested` — i.e. applying the suggestion would
 * overwrite something the user already entered. Drives the "سيستبدل"
 * warning in the suggestion-review panel; the apply button itself is
 * always an explicit click regardless, so a suggestion is never silently
 * auto-applied even when this returns false.
 */
export function hasConflict(current: unknown, suggested: unknown): boolean {
  if (current === undefined || current === null || current === "") return false;
  return current !== suggested;
}

/** Compact "R-2 · 6 طوابق · V-A" header summary; "" when nothing is set yet. */
export function buildProfileSummary(profile: Partial<BuildingProfile> | null | undefined, isAr: boolean): string {
  if (!profile) return "";
  const parts: string[] = [];
  if (profile.occupancy_group) parts.push(profile.occupancy_group);
  if (profile.stories !== null && profile.stories !== undefined) {
    parts.push(`${profile.stories} ${isAr ? "طوابق" : "fl."}`);
  }
  if (profile.construction_type) parts.push(profile.construction_type);
  return parts.join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface BuildingProfileCardProps {
  conversationId: string | null;
  userId: string | null;
  language: "ar" | "en" | string;
  /** Last N user-message texts from the open conversation — used only for "اقتراح من المحادثة"; never sent anywhere. */
  recentUserMessages: string[];
}

export default function BuildingProfileCard({ conversationId, userId, language, recentUserMessages }: BuildingProfileCardProps) {
  const isAr = language !== "en";
  const dir = isAr ? "rtl" : "ltr";
  const { toast } = useToast();

  const [profile, setProfile] = useState<BuildingProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BuildingProfileInput>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState<Partial<BuildingProfile> | null>(null);

  const loadProfile = useCallback(async () => {
    if (!conversationId) { setProfile(null); return; }
    setLoading(true);
    try {
      const supabase = await getSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any).from("building_profiles").select("*").eq("conversation_id", conversationId);
      if (userId) query = query.eq("user_id", userId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      setProfile((data as BuildingProfile) ?? null);
    } catch {
      // No row yet / table momentarily unreachable — treat as "no profile".
      // Never blocks the chat.
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId, userId]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const openEdit = () => {
    setDraft(profile ? ({ ...profile } as BuildingProfileInput) : {});
    setErrors([]);
    setSuggestion(null);
    setOpen(true);
  };

  const closeEdit = () => { setOpen(false); setSuggestion(null); };

  const handleSuggest = () => {
    const text = recentUserMessages.slice(-12).join("\n\n");
    setSuggestion(suggestProfileFromText(text));
  };

  const applySuggestedField = (key: string) => {
    if (!suggestion) return;
    const value = (suggestion as Record<string, unknown>)[key];
    setDraft((d) => ({ ...d, [key]: value } as BuildingProfileInput));
  };

  const applyAllSuggested = () => {
    if (!suggestion) return;
    setDraft((d) => ({ ...d, ...suggestion } as BuildingProfileInput));
  };

  const handleSave = async () => {
    const result = validateBuildingProfile(draft);
    if (!result.ok) { setErrors(result.errors); return; }
    if (!conversationId) return; // card only ever renders with an open conversation
    if (Object.keys(result.value).length === 0) { closeEdit(); return; }

    setSaving(true);
    setErrors([]);
    try {
      const supabase = await getSupabaseClient();
      if (profile?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("building_profiles").update(result.value).eq("id", profile.id);
        if (error) throw error;
        setProfile((prev) => (prev ? ({ ...prev, ...result.value } as BuildingProfile) : prev));
      } else {
        const payload = {
          ...result.value,
          conversation_id: conversationId,
          ...(userId ? { user_id: userId } : {}),
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).from("building_profiles").insert(payload).select().single();
        if (error) throw error;
        setProfile(data as BuildingProfile);
      }
      closeEdit();
    } catch {
      toast({
        title: isAr ? "تعذّر حفظ بيانات المبنى" : "Could not save the building profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!conversationId) return null;

  const completeness = profileCompleteness(profile);
  const pct = Math.round(completeness.score * 100);
  const summary = buildProfileSummary(profile, isAr);

  const fieldInputClass =
    "px-2.5 py-1.5 rounded-lg bg-background border border-border/50 text-sm text-foreground focus:outline-none focus:border-primary/50";

  return (
    <>
      <button
        type="button"
        onClick={openEdit}
        disabled={loading}
        dir={dir}
        className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border/50 bg-secondary/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-60"
        title={isAr ? "بيانات المبنى لهذه المحادثة" : "Building data for this conversation"}
      >
        <Building2 className="w-3.5 h-3.5" />
        <span className="max-w-[160px] truncate">
          {profile ? (summary || (isAr ? "بيانات جزئية" : "Partial data")) : (isAr ? "بيانات المبنى" : "Building data")}
        </span>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{
            color: pct === 100 ? "#00D4FF" : "#7a8898",
            background: pct === 100 ? "rgba(0,212,255,0.12)" : "rgba(255,255,255,0.06)",
          }}
        >
          {pct}%
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={closeEdit}
        >
          <div
            dir={dir}
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border/60 bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Building2 className="w-4 h-4 text-primary" />
                {isAr ? "بيانات المبنى" : "Building data"}
              </div>
              <button onClick={closeEdit} className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground" aria-label="close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {completeness.missing.length > 0 && (
              <p className="text-xs text-muted-foreground mb-3">
                {isAr ? "حقول ناقصة: " : "Missing: "}{completeness.missing.join(isAr ? "، " : ", ")}
              </p>
            )}

            {/* اقتراح من المحادثة */}
            <div className="mb-4 p-3 rounded-xl border border-dashed border-border/50 bg-secondary/20">
              <button
                type="button"
                onClick={handleSuggest}
                disabled={recentUserMessages.length === 0}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80 disabled:opacity-40"
              >
                <Wand2 className="w-3.5 h-3.5" />
                {isAr ? "اقتراح من المحادثة" : "Suggest from conversation"}
              </button>

              {suggestion && (
                Object.keys(suggestion).length === 0 ? (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {isAr ? "لم يتم العثور على معطيات صريحة في المحادثة." : "No explicit data found in the conversation."}
                  </p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {Object.entries(suggestion).map(([key, value]) => {
                      const current = (draft as Record<string, unknown>)[key];
                      const conflicts = hasConflict(current, value);
                      return (
                        <div key={key} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-muted-foreground">
                            {fieldLabel(key, isAr)}
                            {": "}
                            <strong className="text-foreground">{formatSuggestedValue(key, value, isAr)}</strong>
                            {conflicts && (
                              <span className="text-amber-500">
                                {" "}({isAr ? "سيستبدل" : "replaces"} {formatSuggestedValue(key, current, isAr)})
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => applySuggestedField(key)}
                            className="shrink-0 text-[11px] px-2 py-0.5 rounded-md border border-border/50 hover:border-primary/50 hover:text-primary"
                          >
                            {isAr ? "تطبيق" : "Apply"}
                          </button>
                        </div>
                      );
                    })}
                    <button type="button" onClick={applyAllSuggested} className="text-[11px] font-medium text-primary hover:opacity-80 mt-1">
                      {isAr ? "تطبيق الكل" : "Apply all"}
                    </button>
                  </div>
                )
              )}
            </div>

            {/* Form fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                {isAr ? "اسم المبنى" : "Building name"}
                <input
                  type="text"
                  value={draft.name ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className={fieldInputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {isAr ? "تصنيف الإشغال" : "Occupancy group"}
                <select
                  value={draft.occupancy_group ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, occupancy_group: (e.target.value || null) as OccupancyGroup | null }))}
                  className={fieldInputClass}
                >
                  <option value="">{isAr ? "— غير محدد —" : "— Not set —"}</option>
                  {OCCUPANCY_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {isAr ? "نوع الإنشاء" : "Construction type"}
                <select
                  value={draft.construction_type ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, construction_type: (e.target.value || null) as ConstructionType | null }))}
                  className={fieldInputClass}
                >
                  <option value="">{isAr ? "— غير محدد —" : "— Not set —"}</option>
                  {CONSTRUCTION_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {isAr ? "عدد الطوابق" : "Stories"}
                <input
                  type="number" min={0} step={1}
                  value={draft.stories ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, stories: e.target.value === "" ? null : Number(e.target.value) }))}
                  className={fieldInputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {isAr ? "الارتفاع (م)" : "Height (m)"}
                <input
                  type="number" min={0} step="any"
                  value={draft.height_m ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, height_m: e.target.value === "" ? null : Number(e.target.value) }))}
                  className={fieldInputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {isAr ? "المساحة الإجمالية (م²)" : "Gross area (m²)"}
                <input
                  type="number" min={0} step="any"
                  value={draft.gross_area_m2 ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, gross_area_m2: e.target.value === "" ? null : Number(e.target.value) }))}
                  className={fieldInputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {isAr ? "عدد الشاغلين المصمَّم" : "Design occupant load"}
                <input
                  type="number" min={0} step={1}
                  value={draft.occupant_load ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, occupant_load: e.target.value === "" ? null : Number(e.target.value) }))}
                  className={fieldInputClass}
                />
              </label>

              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                {isAr ? "مرشات الحريق" : "Sprinklers"}
                <div className="flex gap-1">
                  {([
                    [null, isAr ? "غير محدد" : "Not set"],
                    [true, isAr ? "مركّبة" : "Yes"],
                    [false, isAr ? "لا توجد" : "No"],
                  ] as const).map(([val, label]) => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, sprinklered: val }))}
                      className="flex-1 px-2 py-1.5 rounded-lg text-[11px] border transition-colors"
                      style={
                        (draft.sprinklered ?? null) === val
                          ? { borderColor: "rgba(0,212,255,0.5)", color: "#00D4FF", background: "rgba(0,212,255,0.08)" }
                          : { borderColor: "hsl(var(--border) / 0.5)" }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {isAr ? "تصنيف الخطورة" : "Hazard classification"}
                <input
                  type="text"
                  value={draft.hazard_class ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, hazard_class: e.target.value }))}
                  className={fieldInputClass}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                {isAr ? "ملاحظات" : "Notes"}
                <textarea
                  rows={3}
                  value={draft.notes ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  className={`${fieldInputClass} resize-none`}
                />
              </label>
            </div>

            {errors.length > 0 && (
              <ul className="mt-3 text-xs text-destructive space-y-0.5 list-disc ps-4">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}

            <div className="flex items-center justify-end gap-2 mt-4">
              <button type="button" onClick={closeEdit} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground">
                {isAr ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                style={{ background: "#00D4FF", color: "hsl(220 40% 6%)" }}
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                {isAr ? "حفظ" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
