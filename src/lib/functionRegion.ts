// The Supabase project database lives in ap-southeast-2 (Sydney). Unpinned
// edge-function invocations execute NEAR THE CALLER, so every DB round trip
// inside the function crosses half the planet (~400ms each — measured
// 2026-09-02: auth.getUser alone cost ~1s). Sending x-region pins execution
// next to the database; the measured pre-first-byte path on primary collapsed
// from ~12.2s to ~2.2s. Any function receiving this header must list x-region
// in its Access-Control-Allow-Headers or the browser preflight fails (the
// exact failure class of the 2026-08-31 advisory "Connection error" outage).
export const SUPABASE_FN_REGION = "ap-southeast-2";
export const FN_REGION_HEADER: Record<string, string> = { "x-region": SUPABASE_FN_REGION };
