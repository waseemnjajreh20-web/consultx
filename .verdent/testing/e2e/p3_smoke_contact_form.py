"""Phase 3 (P3) post-deploy smoke test — send-contact-message.

Confirms the `send-contact-message` edge function (a first-time deploy in
this release — see docs/launch/deploy-runbook-20260823.md, Step 3) returns
its documented success shape: `{"success": true}` with HTTP 200
(supabase/functions/send-contact-message/index.ts). Contact.tsx is the ONLY
channel the Privacy and Refund policies point users to, so a silent failure
here has policy-level consequences, not just a broken form.

This makes ONE REAL network call that sends ONE REAL email through Resend to
the live support inbox (info@consultx.app), plus a best-effort confirmation
email back to the sender address. The subject is prefixed `[SMOKE TEST]` so
a human scanning the inbox knows immediately this is not a real customer
inquiry. This is a deliberate, expected side effect of running this script
(not a bug) — use --dry-run to check configuration without sending anything.

No login/JWT is required: send-contact-message is a public endpoint
(verify_jwt = false in supabase/config.toml, and the function itself does
not check an Authorization header).

Usage:
    python p3_smoke_contact_form.py
    python p3_smoke_contact_form.py --dry-run
    python p3_smoke_contact_form.py --help

Required environment variables:
    CONSULTX_SUPABASE_ANON_KEY   Supabase anon key
    CONSULTX_TEST_EMAIL          address used as the sender/reply-to on the
                                  test submission (a real, deliverable test
                                  mailbox — this is the same variable used by
                                  the other p3/p2 scripts, reused here rather
                                  than inventing a new one)

Exit codes: 0 = pass, 1 = configuration error or assertion failure.
"""
import argparse
import os
import sys

import httpx

import e2e_common as common

REQUIRED_ENV_VARS = [
    "CONSULTX_SUPABASE_ANON_KEY",
    "CONSULTX_TEST_EMAIL",
]

CONTACT_URL = f"{common.SUPABASE_URL}/functions/v1/send-contact-message"


def check_env() -> None:
    missing = [name for name in REQUIRED_ENV_VARS if not os.environ.get(name)]
    if missing:
        raise SystemExit(
            "Missing required environment variable(s): "
            + ", ".join(missing)
            + ". Set them before running this script. No fallback or committed "
            "value is ever used."
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Smoke test: send-contact-message accepts a submission and returns "
            "its documented success shape. Sends ONE real, clearly-marked test "
            "email through the live contact form."
        )
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate configuration and exit without sending anything or "
        "making any network calls.",
    )
    return parser.parse_args()


def run_check() -> bool:
    email = os.environ["CONSULTX_TEST_EMAIL"]
    anon_key = common.get_anon_key()

    payload = {
        "name": "ConsultX Smoke Test",
        "email": email,
        "subject": "[SMOKE TEST] p3_smoke_contact_form.py — post-deploy check",
        "message": (
            "[SMOKE TEST] This message was generated automatically by "
            "p3_smoke_contact_form.py as part of the 2026-08-23 post-deploy "
            "smoke suite. No action is required — please disregard."
        ),
    }
    headers = {
        "Content-Type": "application/json",
        "apikey": anon_key,
    }

    print(f"POST {CONTACT_URL} (subject={payload['subject']!r}) ...")
    resp = httpx.post(CONTACT_URL, headers=headers, json=payload, timeout=30)
    print(f"status={resp.status_code}")

    try:
        data = resp.json()
    except Exception:
        print(f"[FAIL] response body is not valid JSON: {resp.text[:500]!r}")
        return False

    print(f"body={data!r}")

    if resp.status_code != 200:
        print(f"[FAIL] expected HTTP 200, got {resp.status_code}.")
        return False

    if data.get("success") is not True:
        print(f"[FAIL] expected {{'success': true}}, got {data!r}.")
        return False

    print("[PASS] send-contact-message accepted the smoke submission "
          "({'success': true}). Check info@consultx.app for the "
          "[SMOKE TEST]-prefixed message.")
    return True


def main() -> int:
    args = parse_args()
    check_env()

    if args.dry_run:
        print("[DRY RUN] Configuration OK (all required environment variables "
              "are set). No network calls made, no email sent.")
        return 0

    ok = run_check()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
