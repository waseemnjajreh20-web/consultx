"""Phase 3 (P3) post-deploy smoke test — process-subscription-renewal fails closed.

Confirms that `process-subscription-renewal` — the cron job that converts
trials and charges renewals against stored cards — rejects a request that
does NOT carry the `x-cron-secret` header with HTTP 401
(supabase/functions/process-subscription-renewal/index.ts, ~line 72-77).
This is the launch blocker documented in
docs/audits/production-truth-20260823.md and docs/OWNER_ACTIONS.md: the
function must fail CLOSED (reject unauthenticated calls) rather than open,
because it moves money against real saved cards.

This script deliberately NEVER reads, generates, or sends a real
`CRON_SECRET` / `x-cron-secret` value — it only proves the negative case
(no header -> 401). It never attempts a positive-auth call, by design: doing
so would require possessing the production secret, which this script must
never hold.

Read-only / non-destructive: the endpoint's own auth gate rejects the
request before any billing logic runs, so no subscription or payment state
is touched.

Usage:
    python p3_smoke_cron_auth.py
    python p3_smoke_cron_auth.py --dry-run
    python p3_smoke_cron_auth.py --help

Required environment variables:
    CONSULTX_SUPABASE_ANON_KEY   Supabase anon key
    CONSULTX_SMOKE_CONFIRM       must be set to "yes" for a real (non
                                  --dry-run) run. This script needs no test
                                  account credentials, so it POSTs to a LIVE
                                  PRODUCTION endpoint the moment the anon key
                                  is set — this variable is the only thing
                                  that gates that. Not required for --dry-run
                                  or --help.

Exit codes: 0 = pass, 1 = configuration error or assertion failure.
"""
import argparse
import sys

import httpx

import e2e_common as common

REQUIRED_ENV_VARS = [
    "CONSULTX_SUPABASE_ANON_KEY",
]

RENEWAL_URL = f"{common.SUPABASE_URL}/functions/v1/process-subscription-renewal"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Smoke test: process-subscription-renewal returns 401 when called "
            "WITHOUT the x-cron-secret header, proving it fails closed. This "
            "script never sends a real cron secret."
        )
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate configuration and exit without making any network calls.",
    )
    return parser.parse_args()


def run_check() -> bool:
    anon_key = common.get_anon_key()

    # Deliberately no x-cron-secret header at all.
    headers = {
        "Content-Type": "application/json",
        "apikey": anon_key,
    }

    print(f"POST {RENEWAL_URL} (no x-cron-secret header) ...")
    resp = httpx.post(RENEWAL_URL, headers=headers, json={}, timeout=30)
    print(f"status={resp.status_code}")
    print(f"body={resp.text[:300]!r}")

    if resp.status_code != 401:
        print(
            f"[FAIL] expected HTTP 401 (fails closed with no cron secret), got "
            f"{resp.status_code}. If this is 500, CRON_SECRET may be unset on "
            "the function entirely — that is a different, also-bad state; "
            "investigate before considering this a pass."
        )
        return False

    print("[PASS] process-subscription-renewal rejected the unauthenticated "
          "call with HTTP 401 — it fails closed.")
    return True


def main() -> int:
    args = parse_args()
    common.check_env(REQUIRED_ENV_VARS)

    if args.dry_run:
        print("[DRY RUN] Configuration OK (all required environment variables "
              "are set). No network calls made.")
        return 0

    common.require_smoke_confirm(
        "POST an unauthenticated request to the live production "
        "process-subscription-renewal endpoint"
    )

    ok = run_check()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
