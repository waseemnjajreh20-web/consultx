/**
 * buildingProfileBlock.ts — server side of the Building Profile feature
 * (C1c, 2026-09-03). Flag: BUILDING_PROFILE_ENABLED (default off).
 *
 * The client sends only `conversation_id`. This module reads the caller's own
 * building_profiles row for that conversation — scoped by the AUTHENTICATED
 * user id, never by anything the client supplies about the profile — and
 * renders it as a labelled "building data" system block. It mirrors
 * profileToPromptBlock() in src/lib/buildingProfile.ts; keep the two in step
 * when a column is added.
 *
 * The block is BACKGROUND CONTEXT for computing an answer, never a code
 * source: the header says so in both languages, and index.ts injects it as
 * its own system message — never mixed into retrieved SBC context and never
 * fed to the citation-token pipeline.
 */

// deno-lint-ignore no-explicit-any
type AnyClient = any;

export interface BuildingProfileRow {
  name?: string | null;
  occupancy_group?: string | null;
  stories?: number | null;
  /** numeric columns arrive as strings through PostgREST. */
  height_m?: number | string | null;
  gross_area_m2?: number | string | null;
  sprinklered?: boolean | null;
  construction_type?: string | null;
  hazard_class?: string | null;
  occupant_load?: number | null;
  notes?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Length caps — the row is user-authored free text; bound the prompt cost. */
const MAX_NAME = 120;
const MAX_ENUM = 8;
const MAX_HAZARD = 120;
const MAX_NOTES = 600;

const LABELS: Record<string, { ar: string; en: string }> = {
  name: { ar: "الاسم", en: "Name" },
  occupancy_group: { ar: "تصنيف الإشغال", en: "Occupancy group" },
  stories: { ar: "عدد الطوابق", en: "Stories" },
  height_m: { ar: "الارتفاع", en: "Height" },
  gross_area_m2: { ar: "المساحة الإجمالية", en: "Gross area" },
  sprinklers: { ar: "مرشات الحريق", en: "Sprinklers" },
  construction_type: { ar: "نوع الإنشاء", en: "Construction type" },
  hazard_class: { ar: "تصنيف الخطورة", en: "Hazard classification" },
  occupant_load: { ar: "عدد الشاغلين المصمَّم", en: "Design occupant load" },
  notes: { ar: "ملاحظات", en: "Notes" },
};

function envGet(name: string): string {
  const d = (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } }).Deno;
  try {
    return d?.env?.get?.(name) ?? "";
  } catch {
    return "";
  }
}

export function buildingProfileEnabled(): boolean {
  return envGet("BUILDING_PROFILE_ENABLED").trim() === "1";
}

/** Accepts only a canonical UUID — anything else is ignored, never queried. */
export function isConversationId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const t = value.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "" when the row has no meaningful field, so callers can skip the block. */
export function renderBuildingProfileBlock(
  row: BuildingProfileRow | null | undefined,
  language: "ar" | "en",
): string {
  if (!row) return "";
  const isAr = language !== "en";
  const L = (k: string) => (isAr ? LABELS[k].ar : LABELS[k].en);
  const lines: string[] = [];

  const name = clip(row.name, MAX_NAME);
  if (name) lines.push(`${L("name")}: ${name}`);
  const occ = clip(row.occupancy_group, MAX_ENUM);
  if (occ) lines.push(`${L("occupancy_group")}: ${occ}`);
  const stories = num(row.stories);
  if (stories !== null) lines.push(`${L("stories")}: ${stories}`);
  const height = num(row.height_m);
  if (height !== null) lines.push(`${L("height_m")}: ${height} ${isAr ? "م" : "m"}`);
  const area = num(row.gross_area_m2);
  if (area !== null) lines.push(`${L("gross_area_m2")}: ${area} ${isAr ? "م²" : "m²"}`);
  if (typeof row.sprinklered === "boolean") {
    const v = row.sprinklered
      ? (isAr ? "مرشات مركّبة" : "sprinklered")
      : (isAr ? "لا توجد مرشات" : "not sprinklered");
    lines.push(`${L("sprinklers")}: ${v}`);
  }
  const ct = clip(row.construction_type, MAX_ENUM);
  if (ct) lines.push(`${L("construction_type")}: ${ct}`);
  const hz = clip(row.hazard_class, MAX_HAZARD);
  if (hz) lines.push(`${L("hazard_class")}: ${hz}`);
  const ol = num(row.occupant_load);
  if (ol !== null) lines.push(`${L("occupant_load")}: ${ol}`);
  const notes = clip(row.notes, MAX_NOTES);
  if (notes) lines.push(`${L("notes")}: ${notes}`);

  if (lines.length === 0) return "";

  const header = isAr
    ? "═══ معطيات المبنى (من إدخال المستخدم) ═══\n" +
      "هذه معطيات أدخلها المستخدم عن مبناه — ليست نصاً من الكود ولا يجوز الاستشهاد بها كمصدر نظامي. " +
      "استخدمها فقط كسياق لتطبيق اشتراطات الكود على هذا المبنى وحساب الإجابة."
    : "═══ Building data (user-provided) ═══\n" +
      "Facts the user entered about their building — NOT a code source; never cite this block as an authority. " +
      "Use it only as context for applying the code's requirements to this building and computing the answer.";

  return [header, ...lines].join("\n");
}

/**
 * Reads the caller's profile for the conversation and renders it. Fail-soft:
 * any error (RLS, network, schema) logs and yields "" — the answer proceeds
 * exactly as it would with the flag off.
 */
export async function fetchBuildingProfileBlock(
  adminClient: AnyClient,
  conversationId: string,
  userId: string,
  language: "ar" | "en",
): Promise<string> {
  const { data, error } = await adminClient
    .from("building_profiles")
    .select("name,occupancy_group,stories,height_m,gross_area_m2,sprinklered,construction_type,hazard_class,occupant_load,notes")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[BuildingProfile] read failed:", error?.message ?? String(error));
    return "";
  }
  return renderBuildingProfileBlock(data as BuildingProfileRow | null, language);
}
