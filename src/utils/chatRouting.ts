/**
 * Chat routing utilities for ConsultX
 * Parses [SWITCH:...] tokens from AI responses to trigger mode changes.
 */

export function parseSwitchMarker(content: string): {
  found: boolean;
  targetMode: string | null;
  cleanContent: string;
} {
  const result = { found: false, targetMode: null as string | null, cleanContent: content };

  const match = content.match(/\[SWITCH:(استشاري|تحليلي)\]/);
  if (!match) return result;

  const modeMap: Record<string, string> = {
    استشاري: "standard",
    تحليلي: "analysis",
  };

  const raw = match[1];
  if (!modeMap[raw]) return result;

  result.found = true;
  result.targetMode = modeMap[raw];
  result.cleanContent = content.replace(match[0], "").trim();
  return result;
}
