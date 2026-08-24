"""Phase 3 (P3) post-deploy smoke test — moyasar-webhook rejects a bad signature.

Confirms that `moyasar-webhook` rejects a POST carrying a deliberately WRONG
`X-Moyasar-Signature` header with HTTP 401
(supabase/functions/moyasar-webhook/index.ts, ~line 79-117: the header must
be present, and the HMAC-SHA256 computed over the raw body using
MOYASAR_WEBHOOK_SECRET must match it byte-for-byte, or the request is
rejected before any subscription/payment row is read or written).

This script can never know the real MOYASAR_WEBHOOK_SECRET, so any signature
value it sends is guaranteed to mismatch — that is the point: it proves the
negative case (wrong signature -> 401 -> no further processing), not a
forged-but-valid signature.

The submitted payload uses an OBVIOUSLY SYNTHETIC charge id
(`smoke_invalid_<uuid>`) and a random, non-existent subscription id, so that
if anything ever did land in the database despite the signature check (it
should not, and the code path guarantees it cannot: the signature check in
moyasar-webhook/index.ts runs and returns before any database call is
made — see lines 68-124, all of which precede the first `adminClient.from()`
call at line ~124), it would be trivially identifiable and safe to delete.

"No database effect" verification note: this script does NOT attempt to
query `payment_transactions` or `user_subscriptions` with the anon key,
because Row Level Security blocks anonymous reads of those tables
regardless of their contents — an empty/denied read would prove nothing
either way. The authoritative guarantee that no database effect occurred is
the code path itself (signature verification precedes every database call in
the function), not an external query. This script's only executable
assertion is the observable HTTP behavior: HTTP 401.

Read-only / non-destructive: the signature gate rejects the request before
any billing logic runs.

Usage:
    python p3_smoke_webhook_signature.py
    python p3_smoke_webhook_signature.py --dry-run
    python p3_smoke_webhook_signature.py --help

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
import uuid

import httpx

import e2e_common as common

REQUIRED_ENV_VARS = [
    "CONSULTX_SUPABASE_ANON_KEY",
]

WEBHOOK_URL = f"{common.SUPABASE_URL}/functions/v1/moyasar-webhook"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Smoke test: moyasar-webhook returns 401 for a deliberately wrong "
            "X-Moyasar-Signature, and (by code inspection, not by DB query) "
            "makes no database write before that check fails."
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

    synthetic_charge_id = f"smoke_invalid_{uuid.uuid4()}"
    synthetic_subscription_id = str(uuid.uuid4())

    payload = {
        "id": synthetic_charge_id,
        "status": "paid",
        "amount": 100,
        "currency": "SAR",
        "metadata": {
            "subscription_id": synthetic_subscription_id,
            "flow": "trial_card_verification",
        },
    }
    headers = {
        "Content-Type": "application/json",
        "apikey": anon_key,
        # Deliberately wrong: this cannot ever equal the real HMAC computed
        # with MOYASAR_WEBHOOK_SECRET, which this script never has access to.
        "X-Moyasar-Signature": "smoke-test-deliberately-invalid-signature",
    }

    print(f"POST {WEBHOOK_URL} (charge id={synthetic_charge_id}, "
          "wrong X-Moyasar-Signature) ...")
    resp = httpx.post(WEBHOOK_URL, headers=headers, json=payload, timeout=30)
    print(f"status={resp.status_code}")
    print(f"body={resp.text[:300]!r}")

    if resp.status_code != 401:
        print(
            f"[FAIL] expected HTTP 401 (signature mismatch rejected), got "
            f"{resp.status_code}."
        )
        return False

    print("[PASS] moyasar-webhook rejected the forged-signature payload with "
          "HTTP 401. Synthetic charge id "
          f"{synthetic_charge_id!r} is safe to search for and discard if it "
          "is ever found anywhere (it should not be, since the signature "
          "check precedes every database call in the function).")
    return True


def main() -> int:
    args = parse_args()
    common.check_env(REQUIRED_ENV_VARS)

    if args.dry_run:
        print("[DRY RUN] Configuration OK (all required environment variables "
              "are set). No network calls made.")
        return 0

    common.require_smoke_confirm(
        "POST a synthetic, deliberately-invalid-signature payload to the "
        "live production moyasar-webhook endpoint"
    )

    ok = run_check()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
