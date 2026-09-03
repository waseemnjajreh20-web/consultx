/**
 * C1c — building profile SERVER wiring (2026-09-03).
 *
 * 1. Unit-tests the Deno-side helper (buildingProfileBlock.ts) under Node.
 * 2. Pins the fire-safety-chat / ChatInterface wiring contract at source
 *    level, the same way clauseScrubWiring.test.ts does: the block is
 *    prefetched before the access gate, awaited after it, injected as its own
 *    system message AFTER the memory block and BEFORE the retry prompt, and
 *    the client sends conversation_id only while BUILDING_PROFILE_UI is on.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildingProfileEnabled,
  fetchBuildingProfileBlock,
  isConversationId,
  renderBuildingProfileBlock,
} from "../../supabase/functions/fire-safety-chat/buildingProfileBlock.ts";
import { conversationBodyField, profileToPromptBlock } from "../lib/buildingProfile";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const g = globalThis as unknown as { Deno?: unknown };
afterEach(() => {
  delete g.Deno;
});

const SAMPLE = {
  name: "  برج الرياض  ",
  occupancy_group: "R-2",
  stories: 12,
  height_m: "38.5", // numeric columns arrive as strings through PostgREST
  gross_area_m2: 9600,
  sprinklered: true,
  construction_type: "I-B",
  hazard_class: "",
  occupant_load: 640,
  notes: "مبنى قائم",
};

describe("buildingProfileEnabled — flag reading", () => {
  it("is off without Deno, off unless exactly '1'", () => {
    expect(buildingProfileEnabled()).toBe(false);
    g.Deno = { env: { get: (k: string) => (k === "BUILDING_PROFILE_ENABLED" ? "true" : undefined) } };
    expect(buildingProfileEnabled()).toBe(false);
    g.Deno = { env: { get: (k: string) => (k === "BUILDING_PROFILE_ENABLED" ? " 1 " : undefined) } };
    expect(buildingProfileEnabled()).toBe(true);
  });
});

describe("isConversationId", () => {
  it("accepts only a canonical UUID", () => {
    expect(isConversationId("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    expect(isConversationId("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(true);
    expect(isConversationId("abc")).toBe(false);
    expect(isConversationId("3f2504e0-4f89-41d3-9a0c-0305e82c3301 or 1=1")).toBe(false);
    expect(isConversationId("")).toBe(false);
    expect(isConversationId(null)).toBe(false);
    expect(isConversationId({ toString: () => "3f2504e0-4f89-41d3-9a0c-0305e82c3301" })).toBe(false);
  });
});

describe("renderBuildingProfileBlock", () => {
  it("renders every set field, coerces numeric strings, trims, and labels itself as NOT a code source", () => {
    const ar = renderBuildingProfileBlock(SAMPLE, "ar");
    expect(ar).toContain("معطيات المبنى");
    expect(ar).toContain("ليست نصاً من الكود");
    expect(ar).toContain("الاسم: برج الرياض");
    expect(ar).toContain("الارتفاع: 38.5 م");
    expect(ar).toContain("مرشات الحريق: مرشات مركّبة");
    expect(ar).toContain("عدد الشاغلين المصمَّم: 640");
    expect(ar).not.toContain("تصنيف الخطورة"); // empty string → omitted
    const en = renderBuildingProfileBlock(SAMPLE, "en");
    expect(en).toContain("NOT a code source");
    expect(en).toContain("Height: 38.5 m");
    expect(en).toContain("Sprinklers: sprinklered");
  });

  it("returns '' for null / empty rows so the caller injects nothing", () => {
    expect(renderBuildingProfileBlock(null, "ar")).toBe("");
    expect(renderBuildingProfileBlock({}, "ar")).toBe("");
    expect(renderBuildingProfileBlock({ name: "   ", notes: "", height_m: "not-a-number" }, "en")).toBe("");
  });

  it("caps user-authored free text (notes 600, name 120) and collapses whitespace", () => {
    const long = "x".repeat(1000);
    const out = renderBuildingProfileBlock({ notes: long, name: "a\n\n  b" }, "en");
    expect(out).toContain("Name: a b");
    const notesLine = out.split("\n").find((l) => l.startsWith("Notes:"))!;
    expect(notesLine.length).toBeLessThan(620);
    expect(notesLine.endsWith("…")).toBe(true);
  });

  it("stays in step with the client-side profileToPromptBlock() field by field", () => {
    const clientInput = { ...SAMPLE, name: SAMPLE.name.trim(), height_m: 38.5 } as unknown as Parameters<typeof profileToPromptBlock>[0];
    const clientLines = profileToPromptBlock(clientInput, "ar").split("\n").slice(1);
    const serverLines = renderBuildingProfileBlock(SAMPLE, "ar").split("\n").slice(2);
    expect(serverLines).toEqual(clientLines);
  });
});

describe("fetchBuildingProfileBlock — scoped read, fail-soft", () => {
  function fakeClient(result: { data: unknown; error: unknown }) {
    const calls: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "select", "eq", "limit"]) {
      chain[m] = (...args: unknown[]) => { calls.push([m, args]); return chain; };
    }
    chain.maybeSingle = async () => { calls.push(["maybeSingle", []]); return result; };
    return { client: chain, calls };
  }

  it("filters by BOTH the conversation id and the authenticated user id, limit 1", async () => {
    const { client, calls } = fakeClient({ data: SAMPLE, error: null });
    const out = await fetchBuildingProfileBlock(client, "3f2504e0-4f89-41d3-9a0c-0305e82c3301", "user-1", "ar");
    expect(out).toContain("الاسم: برج الرياض");
    expect(calls[0]).toEqual(["from", ["building_profiles"]]);
    const eqs = calls.filter(([m]) => m === "eq").map(([, a]) => a);
    expect(eqs).toEqual([["conversation_id", "3f2504e0-4f89-41d3-9a0c-0305e82c3301"], ["user_id", "user-1"]]);
    expect(calls.some(([m, a]) => m === "limit" && (a as unknown[])[0] === 1)).toBe(true);
  });

  it("returns '' on a read error and on no row — never throws", async () => {
    const bad = fakeClient({ data: null, error: { message: "permission denied" } });
    await expect(fetchBuildingProfileBlock(bad.client, "x", "u", "ar")).resolves.toBe("");
    const none = fakeClient({ data: null, error: null });
    await expect(fetchBuildingProfileBlock(none.client, "x", "u", "en")).resolves.toBe("");
  });
});

describe("conversationBodyField (client)", () => {
  it("is {} unless the flag is on AND an id exists — body stays byte-identical otherwise", () => {
    expect(conversationBodyField("3f2504e0-4f89-41d3-9a0c-0305e82c3301", false)).toEqual({});
    expect(conversationBodyField(null, true)).toEqual({});
    expect(conversationBodyField("   ", true)).toEqual({});
    expect(conversationBodyField(" abc ", true)).toEqual({ conversation_id: "abc" });
    const base = { messages: [], mode: "primary" };
    expect(JSON.stringify({ ...base, ...conversationBodyField(undefined, true) })).toBe(JSON.stringify(base));
  });
});

describe("wiring contract — fire-safety-chat/index.ts", () => {
  const src = read("supabase/functions/fire-safety-chat/index.ts");

  it("reads conversation_id from the body and gates the read on the flag + a valid uuid", () => {
    expect(src).toContain("preferred_standards, audience, conversation_id } = body;");
    expect(src).toContain("buildingProfileEnabled() && isConversationId(conversation_id)");
    expect(src).toContain("fetchBuildingProfileBlock(adminClient, conversation_id, userId, language)");
  });

  it("prefetches before the access gate and awaits right after the memory read", () => {
    const prefetch = src.indexOf("const buildingProfilePromise");
    const gate = src.indexOf("// ===== ACCESS & LIMIT CHECK");
    const memoryAwait = src.indexOf("const userMemoryContent = await userMemoryPromise;");
    const profileAwait = src.indexOf("const buildingProfileContent = await buildingProfilePromise;");
    expect(prefetch).toBeGreaterThan(0);
    expect(prefetch).toBeLessThan(gate);
    expect(profileAwait).toBeGreaterThan(memoryAwait);
    expect(profileAwait - memoryAwait).toBeLessThan(200);
  });

  it("injects its own system block after the memory block and before the retry prompt", () => {
    const memory = src.indexOf("if (userMemoryContent) {");
    const profile = src.indexOf("if (buildingProfileContent) {");
    const retry = src.indexOf("if (retry) {", profile);
    expect(memory).toBeGreaterThan(0);
    expect(profile).toBeGreaterThan(memory);
    expect(retry).toBeGreaterThan(profile);
    expect(retry - profile).toBeLessThan(900);
    expect(src).toContain('systemMessages.push({ role: "system", content: buildingProfileContent });');
    // Never routed into retrieved SBC context.
    expect(src).not.toMatch(/sbcContext\s*\+=\s*buildingProfileContent/);
  });
});

describe("wiring contract — ChatInterface.tsx", () => {
  const src = read("src/components/ChatInterface.tsx");

  it("adds conversation_id to the chat body only behind BUILDING_PROFILE_UI, and threads the id into streamChat", () => {
    expect(src).toContain('...conversationBodyField(conversationId, isFlagOn("BUILDING_PROFILE_UI"))');
    expect(src).toMatch(/await streamChat\(\{[\s\S]{0,600}conversationId: convId,/);
  });
});
