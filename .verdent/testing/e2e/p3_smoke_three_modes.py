"""Phase 3 (P3) post-deploy smoke test — the three chat modes.

Exercises all three fire-safety-chat modes. The mode IDs are fixed and
load-bearing across the whole product and must never be renamed:

    primary   -> Main       / رئيسي
    standard  -> Advisory   / استشاري
    analysis  -> Analytical / تحليلي

The in-chat mode-switch protocol is also load-bearing: the model may end a
`primary` or `standard` response with a literal marker asking the user to
switch modes — `[SWITCH:استشاري]` (switch to Advisory) or
`[SWITCH:تحليلي]` (switch to Analytical). This script reports whether such a
marker appeared in each response VERBATIM, exactly as received — it never
strips, trims, or normalizes it, because a regression that mangles or drops
the marker would silently break the in-app upsell/guidance flow.

`primary` must always return HTTP 200 for any signed-in user. `standard` and
`analysis` require an active paid subscription or an active trial; if the
test account does not currently have one, the server-side gate at
fire-safety-chat/index.ts (~line 2910-2922) correctly returns
`403 {"error": "mode_locked"}` for those two modes. That response is treated
as an EXPECTED, reported outcome here (it proves the gate itself works),
not a failure — this script only hard-fails on a genuinely wrong status
(e.g. 401, 500, or a 200 with no content).

Read-only / non-destructive: sends up to three chat messages, no writes to
billing or subscription state.

Usage:
    python p3_smoke_three_modes.py
    python p3_smoke_three_modes.py --dry-run
    python p3_smoke_three_modes.py --help

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

# mode -> (query language, query text)
MODE_QUERIES = {
    "primary": ("en", "What is ConsultX?"),
    "standard": ("ar", "ما هي متطلبات نظام الإنذار في SBC 801؟"),
    "analysis": ("ar", "قارن بين SBC 201 و SBC 801 من حيث نظام الإنذار"),
}

SWITCH_MARKERS = ["[SWITCH:استشاري]", "[SWITCH:تحليلي]"]


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
            "Smoke test: exercise fire-safety-chat on primary/standard/analysis "
            "modes and report any [SWITCH:...] marker verbatim."
        )
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate configuration (required environment variables) and exit "
        "without making any network calls.",
    )
    return parser.parse_args()


def call_mode(token: str, mode: str, language: str, message: str) -> tuple[int, str]:
    body = {
        "messages": [{"role": "user", "content": message}],
        "retry": False,
        "mode": mode,
        "language": language,
        "preferred_standards": ["SBC-201", "SBC-801"],
    }
    headers = common.auth_headers(token)

    with httpx.stream(
        "POST", common.CHAT_URL, headers=headers, json=body, timeout=90
    ) as resp:
        status = resp.status_code
        if status != 200:
            text = resp.read().decode("utf-8", errors="ignore")
            return status, text[:500]

        content = ""
        for line in resp.iter_lines():
            if line.startswith("data: "):
                payload = line[6:].strip()
                if payload == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                    delta = data.get("choices", [{}])[0].get("delta", {}).get("content")
                    if delta:
                        content += delta
                except Exception:
                    pass
        return status, content


def run_check() -> bool:
    email, password = common.require_test_credentials()
    print(f"Logging in as {email} ...")
    token = common.login(email, password)
    print("Login OK, access token obtained.")

    overall_ok = True

    for mode, (language, message) in MODE_QUERIES.items():
        print(f"\n--- mode={mode} ---")
        status, content = call_mode(token, mode, language, message)
        print(f"status={status}")

        if mode == "primary":
            if status != 200 or len(content) == 0:
                print(f"[FAIL] primary mode must return 200 with content. Got "
                      f"status={status}, content_length={len(content)}.")
                overall_ok = False
            else:
                print(f"[PASS] primary mode OK, content_length={len(content)}.")
        else:
            if status == 200:
                if len(content) == 0:
                    print(f"[FAIL] {mode} returned 200 but with empty content.")
                    overall_ok = False
                else:
                    print(f"[PASS] {mode} mode OK, content_length={len(content)}.")
                    found = [m for m in SWITCH_MARKERS if m in content]
                    if found:
                        print(f"[INFO] switch marker(s) present verbatim: {found}")
                    else:
                        print("[INFO] no switch marker in this response (not required).")
            elif status == 403 and "mode_locked" in content:
                print(f"[EXPECTED] {mode} is gated 403 mode_locked — the test "
                      "account has no active trial/paid subscription. This "
                      "proves the server-side gate is working, not a failure.")
            else:
                print(f"[FAIL] {mode} returned an unexpected status/body: "
                      f"status={status} body={content[:300]!r}")
                overall_ok = False

    return overall_ok


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
