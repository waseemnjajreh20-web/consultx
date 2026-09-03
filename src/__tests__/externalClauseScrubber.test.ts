import { describe, it, expect } from "vitest";
import {
  createStreamScrubber,
  scrubExternalClauses,
  SCRUB_TAIL_CHARS,
} from "../../supabase/functions/fire-safety-chat/externalClauseScrubber.ts";

describe("scrubExternalClauses", () => {
  it("reduces a forward external clause reference to the bare standard name", () => {
    expect(scrubExternalClauses("وفق NFPA 13 القسم 8.15.1 يجب").text).toBe("وفق NFPA 13 يجب");
    expect(scrubExternalClauses("per NFPA 72, Section 10.4.2 the panel").text).toBe("per NFPA 72 the panel");
    expect(scrubExternalClauses("NFPA 13 (8.15.1)").text).toBe("NFPA 13");
  });

  it("reduces a backward reference (clause first, standard after)", () => {
    expect(scrubExternalClauses("القسم 8.15.1 من NFPA 13 يشترط").text).toBe("NFPA 13 يشترط");
    expect(scrubExternalClauses("Table 11.2.3.1.1 of NFPA 13 gives").text).toBe("NFPA 13 gives");
  });

  it("never touches SBC references or bare standard names", () => {
    const s = "SBC 801 Section 903.2.11.3 requires sprinklers; NFPA 13 is referenced.";
    expect(scrubExternalClauses(s).text).toBe(s);
    expect(scrubExternalClauses("[SBC-801 Section 903.2.7 | conf:high]").text).toBe("[SBC-801 Section 903.2.7 | conf:high]");
  });

  it("counts every scrub", () => {
    const r = scrubExternalClauses("NFPA 13 Section 8.1 و NFPA 14 البند 7.3.2 و NFPA 20 الجدول 4.1");
    expect(r.scrubbed).toBe(3);
    expect(r.text).toBe("NFPA 13 و NFPA 14 و NFPA 20");
  });
});

describe("createStreamScrubber", () => {
  it("catches a reference split across deltas and releases everything on flush", () => {
    const s = createStreamScrubber();
    const parts = ["يشترط الكود وفق NFPA 1", "3 القسم 8.", "15.1 تركيب المرشات في كل الطوابق"];
    let out = "";
    for (const p of parts) out += s.push(p);
    out += s.flush();
    expect(out).toBe("يشترط الكود وفق NFPA 13 تركيب المرشات في كل الطوابق");
    expect(s.scrubbed).toBe(1);
  });

  it("forwards clean text with only a bounded tail held back", () => {
    const s = createStreamScrubber();
    const long = "a".repeat(SCRUB_TAIL_CHARS + 40);
    const first = s.push(long);
    expect(first.length).toBe(40);
    expect(s.flush()).toBe("a".repeat(SCRUB_TAIL_CHARS));
  });

  it("is a no-op on text without external clauses", () => {
    const s = createStreamScrubber();
    const text = "تنص SBC 801 القسم 903.2.11.3 على تركيب نظام مرشات تلقائية في المباني التي يزيد ارتفاعها عن 16.5 متر.";
    const out = s.push(text) + s.flush();
    expect(out).toBe(text);
    expect(s.scrubbed).toBe(0);
  });
});
