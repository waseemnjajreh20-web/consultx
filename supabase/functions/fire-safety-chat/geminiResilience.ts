/**
 * Gemini resilience helpers for fire-safety-chat.
 *
 * Pure logic (no Deno-specific APIs) so it can be unit-tested and imported
 * safely by the Edge Function.
 */

export type AIErrorClass =
  | "CONSULTX_DAILY_LIMIT"
  | "GEMINI_RATE_LIMIT"
  | "GEMINI_AUTH_ERROR"
  | "GEMINI_REQUEST_ERROR"
  | "GEMINI_PROVIDER_ERROR"
  | "UNKNOWN_AI_ERROR";

export interface ClassifiedAIError {
  classification: AIErrorClass;
  status: number;
  userMessage: string;
  userMessageAr: string;
  logSafe: string;
}

export interface GeminiAttemptResult {
  response: Response;
  errorText: string;
}

export interface QuotaIncrement {
  kind: "mode" | "daily";
  userId: string;
  mode?: string;
}

export const GEMINI_MODEL_CANDIDATES = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

const MODELS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let availableModelsCache: string[] | null = null;
let availableModelsCacheTime = 0;

export function resetGeminiResilienceCache(): void {
  availableModelsCache = null;
  availableModelsCacheTime = 0;
}

export async function fetchAvailableGeminiModels(apiKey: string): Promise<string[]> {
  if (availableModelsCache && Date.now() - availableModelsCacheTime < MODELS_CACHE_TTL_MS) {
    return availableModelsCache;
  }
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1000`
    );
    if (!resp.ok) {
      console.log(`[Gemini] list models failed: ${resp.status}, using default candidates`);
      return GEMINI_MODEL_CANDIDATES;
    }
    const data = await resp.json();
    const names: string[] = (data.models || [])
      .map((m: any) => typeof m.name === "string" ? m.name.replace("models/", "") : "")
      .filter((n: string) => n.startsWith("gemini-"));
    availableModelsCache = names.length > 0 ? names : GEMINI_MODEL_CANDIDATES;
    availableModelsCacheTime = Date.now();
    console.log(`[Gemini] available models: ${availableModelsCache.join(", ")}`);
    return availableModelsCache;
  } catch (e) {
    console.log(`[Gemini] list models error: ${e instanceof Error ? e.message : String(e)}`);
    return GEMINI_MODEL_CANDIDATES;
  }
}

export function buildModelChain(
  preferred: string,
  fallback: string,
  available: string[]
): string[] {
  const chain = new Set<string>();
  if (available.includes(preferred)) chain.add(preferred);
  if (available.includes(fallback) && fallback !== preferred) chain.add(fallback);
  for (const m of GEMINI_MODEL_CANDIDATES) {
    if (available.includes(m) && !chain.has(m)) chain.add(m);
  }
  // If none of the preferred candidates are available, trust the API list and
  // append the newest gemini model that is available as a last resort.
  if (chain.size === 0) {
    const newestAvailable = available
      .filter((m) => m.startsWith("gemini-"))
      .sort()
      .pop();
    if (newestAvailable) chain.add(newestAvailable);
  }
  return Array.from(chain);
}

export function classifyGeminiError(status: number, errorBody: string): ClassifiedAIError {
  const bodyLower = errorBody.toLowerCase();
  const isRateLimit =
    status === 429 ||
    bodyLower.includes("rate limit") ||
    bodyLower.includes("quota") ||
    bodyLower.includes("resource has been exhausted") ||
    bodyLower.includes("too many requests");

  if (isRateLimit) {
    return {
      classification: "GEMINI_RATE_LIMIT",
      status: 503,
      userMessage: "AI provider is temporarily busy. Please try again in a minute.",
      userMessageAr:
        "الخدمة مشغولة حاليًا بسبب حد مؤقت من مزود الذكاء الاصطناعي. يرجى المحاولة خلال دقيقة.",
      logSafe: `Gemini rate limit (HTTP ${status})`,
    };
  }

  if (status === 401 || status === 403 || bodyLower.includes("api key not valid")) {
    return {
      classification: "GEMINI_AUTH_ERROR",
      status: 500,
      userMessage: "Service error occurred",
      userMessageAr: "حدث خطأ في الخدمة",
      logSafe: `Gemini auth error (HTTP ${status})`,
    };
  }

  if (status >= 500 || status === 408 || status === 0) {
    return {
      classification: "GEMINI_PROVIDER_ERROR",
      status: 503,
      userMessage: "AI provider is temporarily unavailable. Please try again in a moment.",
      userMessageAr:
        "مزود الذكاء الاصطناعي غير متاح مؤقتًا. يرجى المحاولة بعد قليل.",
      logSafe: `Gemini provider error (HTTP ${status})`,
    };
  }

  return {
    classification: "GEMINI_REQUEST_ERROR",
    status: 500,
    userMessage: "Service error occurred",
    userMessageAr: "حدث خطأ في الخدمة",
    logSafe: `Gemini request error (HTTP ${status})`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500 || status === 408 || status === 0;
}

export async function fetchGeminiStreamWithRetry(
  apiKey: string,
  model: string,
  systemInstruction: any,
  contents: any[],
  maxAttempts = 3
): Promise<GeminiAttemptResult> {
  const delays = [1000, 2000, 4000];
  let lastErrorText = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const start = Date.now();
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: { temperature: 0.7 },
        }),
      }
    );
    const latency = Date.now() - start;

    if (resp.ok) {
      console.log(
        `[Gemini] ${model} stream OK on attempt ${attempt}/${maxAttempts} (${latency}ms)`
      );
      return { response: resp, errorText: "" };
    }

    const errorText = await resp.text();
    lastErrorText = errorText;
    const retryable = isRetryableStatus(resp.status);
    console.log(
      `[Gemini] ${model} attempt ${attempt}/${maxAttempts} status=${resp.status} latency=${latency}ms retryable=${retryable}`
    );

    if (!retryable || attempt === maxAttempts) {
      return { response: resp, errorText };
    }

    const delay = delays[attempt - 1] ?? 4000;
    console.log(`[Gemini] ${model} retrying in ${delay}ms...`);
    await sleep(delay);
  }

  // Should never reach here, but keeps TypeScript happy.
  return {
    response: new Response(lastErrorText, { status: 500 }),
    errorText: lastErrorText,
  };
}

export async function fetchGeminiNonStreamingWithRetry(
  apiKey: string,
  model: string,
  systemInstruction: any,
  contents: any[],
  maxAttempts = 3
): Promise<GeminiAttemptResult> {
  const delays = [1000, 2000, 4000];
  let lastErrorText = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const start = Date.now();
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: { temperature: 0.7 },
        }),
      }
    );
    const latency = Date.now() - start;

    if (resp.ok) {
      console.log(
        `[Gemini] ${model} non-stream OK on attempt ${attempt}/${maxAttempts} (${latency}ms)`
      );
      return { response: resp, errorText: "" };
    }

    const errorText = await resp.text();
    lastErrorText = errorText;
    const retryable = isRetryableStatus(resp.status);
    console.log(
      `[Gemini] ${model} non-stream attempt ${attempt}/${maxAttempts} status=${resp.status} latency=${latency}ms retryable=${retryable}`
    );

    if (!retryable || attempt === maxAttempts) {
      return { response: resp, errorText };
    }

    const delay = delays[attempt - 1] ?? 4000;
    console.log(`[Gemini] ${model} non-stream retrying in ${delay}ms...`);
    await sleep(delay);
  }

  return {
    response: new Response(lastErrorText, { status: 500 }),
    errorText: lastErrorText,
  };
}

/**
 * Quota rollback helpers.
 *
 * The Edge Function increments usage counters before calling the AI provider.
 * If the provider fails with a retryable/provider error, we roll the increment
 * back so the user is not charged for a message that was never answered.
 */
let pendingQuotaIncrement: QuotaIncrement | null = null;

export function recordQuotaIncrement(kind: "mode" | "daily", userId: string, mode?: string): void {
  pendingQuotaIncrement = { kind, userId, mode };
}

export function clearQuotaIncrement(): void {
  pendingQuotaIncrement = null;
}

export async function rollbackQuotaIfNeeded(adminClient: any): Promise<void> {
  if (!pendingQuotaIncrement) return;
  const { kind, userId, mode } = pendingQuotaIncrement;
  try {
    if (kind === "mode" && mode) {
      await adminClient.rpc("decrement_mode_daily_count", {
        p_user_id: userId,
        p_mode: mode,
      });
    } else {
      await adminClient.rpc("decrement_daily_usage", { p_user_id: userId });
    }
    console.log(`[Quota] Rolled back ${kind} increment for user ${userId}`);
  } catch (e) {
    console.error(
      `[Quota] Rollback failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  pendingQuotaIncrement = null;
}
