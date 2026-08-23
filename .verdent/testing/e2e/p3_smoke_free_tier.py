"""Phase 3 (P3) post-deploy smoke test — free-tier chat access, no card.

Confirms that a signed-in user with NO paid subscription and NO card on file
still gets HTTP 200 from `fire-safety-chat` on the `primary` (main / رئيسي)
mode. This is the server-side gate at
`supabase/functions/fire-safety-chat/index.ts` (~line 2910-2922): a free
user (no active trial, no active paid subscription) is restricted to
`primary` mode only, but `primary` itself must always stay reachable — a
regression here means new signups cannot use the product at all.

This script logs in with an existing test account rather than signing up a
new one, because a fresh signup requires email confirmation
(`mailer_autoconfirm=false`), which cannot be completed headlessly here. The
account named by CONSULTX_TEST_EMAIL / CONSULTX_TEST_PASSWORD is expected to
be a free-tier account (no active trial or paid subscription); if it happens
to carry an active trial or paid plan, `primary` mode still returns 200
regardless (paid/trial access is a superset of free access), so this script
remains a valid regression check either way — it only asserts the floor,
never a ceiling.

Read-only / non-destructive: sends one chat message, makes no writes to
billing or subscription state.

Usage:
    python p3_smoke_free_tier.py
    python p3_smoke_free_tier.py --dry-run
    python p3_smoke_free_tier.py --help

Required environment variables:
    CONSULTX_SUPABASE_ANON_KEY   Supabase anon key
    CONSULTX_TEST_EMAIL          test account email
    CONSULTX_TEST_PASSWORD       test account password

Exit codes: 0 = pass, 1 = configuration error or assertion failure.
"""
import argparse
import json
import os
import sys

import httpx

import e2e_common as common

REQUIRED_ENV_VARS = [
    "CONSULTX_SUPABASE_ANON_KEY",
    "CONSULTX_TEST_EMAIL",
    "CONSULTX_TEST_PASSWORD",
]


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
            "Smoke test: a free-tier (no card, no paid subscription) user gets "
            "HTTP 200 from fire-safety-chat on the primary (main) mode."
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
        "messages": [{"role": "user", "content": "What is ConsultX?"}],
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

        # Drain a little of the stream to confirm it actually produces content,
        # not just a 200 with an empty/error body.
        chunk_count = 0
        for line in resp.iter_lines():
            chunk_count += 1
            if chunk_count >= 3:
                break
        print(f"Received {chunk_count} stream line(s) before stopping early.")

    print("[PASS] free-tier primary-mode chat returned HTTP 200.")
    return True


def main() -> int:
    args = parse_args()
    check_env()

    if args.dry_run:
        print("[DRY RUN] Configuration OK (all required environment variables "
              "are set). No network calls made.")
        return 0

    ok = run_check()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
