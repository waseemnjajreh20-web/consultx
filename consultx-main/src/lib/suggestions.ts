type ChatMode = "primary" | "standard" | "analysis";

const SESSION_KEY = "consultx_shown_suggestions";

// Expanded suggestion pools per mode (indexes into translation keys)
const POOL_SIZE = {
  primary: 8,
  standard: 8,
  analysis: 8,
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getSuggestedQuestionKeys(
  mode: ChatMode,
  count: number = 3,
): string[] {
  const poolSize = POOL_SIZE[mode];
  const allKeys = Array.from({ length: poolSize }, (_, i) => `suggestion_${mode}_${i + 1}`);

  // Check sessionStorage for previously shown suggestions
  const shownRaw = sessionStorage.getItem(SESSION_KEY);
  const shown: string[] = shownRaw ? JSON.parse(shownRaw) : [];

  // Filter out already shown, then shuffle
  const available = allKeys.filter(k => !shown.includes(k));
  const pool = available.length >= count ? available : allKeys; // reset if exhausted
  const selected = shuffle(pool).slice(0, count);

  // Save shown suggestions
  sessionStorage.setItem(SESSION_KEY, JSON.stringify([...shown, ...selected]));

  return selected;
}
