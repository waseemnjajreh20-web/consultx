"""Phase 3 (P3) post-deploy smoke test — citation source header.

Asserts that `fire-safety-chat` responses carry the `X-SBC-Sources` response
header (`Access-Control-Expose-Headers` explicitly lists it at
supabase/functions/fire-safety-chat/index.ts:17, and it is set on every
response at ~line 3225). The frontend's source-citation panel reads this
header to know which SBC source files backed the answer; if it silently
disappears, citations stop rendering with no visible chat-level error.

This only asserts the header KEY is present (it is always attached to the
response, even as an empty string, per the code above) — it does not assert
a non-empty value, since that depends on retrieval finding a match for the
specific question asked, which is a knowledge-quality concern, not a
deploy-smoke concern.

NOT read-only: this sends one real chat message through `fire-safety-chat`
as the test account, which increments that user's per-mode daily quota
counter (`increment_mode_daily_count` / `increment_daily_usage` in
fire-safety-chat/index.ts) and, on that account's first-ever call, can write
`launch_trial_status` on its `profiles` row. It makes no writes to billing
or payment-provider state (Moyasar). A full run of the three chat-calling P3
smoke scripts together (this one, p3_smoke_free_tier.py,
p3_smoke_three_modes.py) consumes up to 5 of the free tier's 10
messages/day for the test account; a repeat run the same day may return
HTTP 429, which means the daily quota is exhausted, not a product failure.

Usage:
    python p3_smoke_citations.py
    python p3_smoke_citations.py --dry-run
    python p3_smoke_citations.py --help

Required environment variables:
    CONSULTX_SUPABASE_ANON_KEY   Supabase anon key
    CONSULTX_TEST_EMAIL          test account email
    CONSULTX_TEST_PASSWORD       test account password

Exit codes: 0 = pass, 1 = configuration error or assertion failure.
"""
import argparse
import sys

import httpx

import e2e_common as common

REQUIRED_ENV_VARS = [
    "CONSULTX_SUPABASE_ANON_KEY",
    "CONSULTX_TEST_EMAIL",
    "CONSULTX_TEST_PASSWORD",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Smoke test: fire-safety-chat responses carry the X-SBC-Sources "
            "response header."
        )
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate configuration (required environment variables) and exit "
        "without making any network calls.",
    )
    return parser.parse_args()


def run_check() -> bool:
    email, password = common.require_test_credentials()
    print(f"Logging in as {email} ...")
    token = common.login(email, password)
    print("Login OK, access token obtained.")

    body = {
        "messages": [
            {
                "role": "user",
                "content": "What is the required exit access travel distance "
                "for a sprinklered Group B occupancy per SBC 201?",
            }
        ],
        "retry": False,
        "mode": "primary",
        "language": "en",
        "preferred_standards": ["SBC-201", "SBC-801"],
    }
    headers = common.auth_headers(token)

    print("Calling fire-safety-chat mode=primary ...")
    with httpx.stream(
        "POST", common.CHAT_URL, headers=headers, json=body, timeout=90
    ) as resp:
        print(f"status={resp.status_code}")
        if resp.status_code != 200:
            text = resp.read().decode("utf-8", errors="ignore")
            print(f"UNEXPECTED response body: {text[:500]}")
            return False

        # httpx.Headers is case-insensitive; read the header before draining
        # the body, since it arrives with the initial response.
        header_present = "x-sbc-sources" in resp.headers
        header_value = resp.headers.get("x-sbc-sources", "")
        print(f"X-SBC-Sources present={header_present!r} value={header_value!r}")

        # Drain a little of the stream so the connection closes cleanly.
        chunk_count = 0
        for line in resp.iter_lines():
            chunk_count += 1
            if chunk_count >= 3:
                break

    if not header_present:
        print("[FAIL] X-SBC-Sources header is missing from the response.")
        return False

    print("[PASS] X-SBC-Sources header is present.")
    return True


def main() -> int:
    args = parse_args()
    common.check_env(REQUIRED_ENV_VARS)

    if args.dry_run:
        print("[DRY RUN] Configuration OK (all required environment variables "
              "are set). No network calls made.")
        return 0

    ok = run_check()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
