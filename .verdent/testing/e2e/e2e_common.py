"""Shared helpers and configuration for ConsultX end-to-end tests.

Credentials and environment-specific values are read from environment
variables. Do not hardcode secrets in this file or in test scripts.
"""
import os
import re
from pathlib import Path

import httpx


def env_value(name: str) -> str:
    """Return an environment variable's value with whitespace stripped.

    A value consisting only of whitespace (e.g. a single space) is treated
    exactly like an unset variable and returns "". Without this, a
    whitespace-only value passes a plain `if not os.environ.get(name)`
    truthiness check and then gets sent to the server as a real credential.
    """
    return os.environ.get(name, "").strip()


def missing_env_vars(names: list[str]) -> list[str]:
    """Return the subset of `names` that are unset or whitespace-only."""
    return [name for name in names if not env_value(name)]


def check_env(required_vars: list[str]) -> None:
    """Exit non-zero with a clear message if any required env var is unset
    or whitespace-only. Call this before any network call.

    Shared by every p2/p3 script so the whitespace-is-missing rule (see
    `env_value`) is enforced in exactly one place instead of being
    reimplemented per script.
    """
    missing = missing_env_vars(required_vars)
    if missing:
        raise SystemExit(
            "Missing required environment variable(s): "
            + ", ".join(missing)
            + ". Set them before running this script. No fallback or committed "
            "value is ever used."
        )


SMOKE_CONFIRM_VAR = "CONSULTX_SMOKE_CONFIRM"


def require_smoke_confirm(production_action: str) -> None:
    """Fail closed unless the operator explicitly opts in to a script that
    fires a live request against PRODUCTION without needing test-account
    credentials (so the normal credential gate never protects it).

    `production_action` should be a short clause describing what the script
    is about to POST to production, e.g. "POST an unauthenticated request to
    the live process-subscription-renewal endpoint".

    Call this after --help/--dry-run handling but before any network call.
    Absent or not equal to "yes" (case-insensitive, after stripping
    whitespace) -> exits non-zero having sent nothing.
    """
    value = env_value(SMOKE_CONFIRM_VAR)
    if value.lower() != "yes":
        raise SystemExit(
            f"Refusing to run: this script will {production_action} — a "
            "real network call against LIVE PRODUCTION. This script needs no "
            "user credentials, so the usual test-credential gate does not "
            f"protect it. Set {SMOKE_CONFIRM_VAR}=yes to confirm you intend "
            "this, then rerun. No network call was made."
        )


BASE_URL = os.environ.get("CONSULTX_BASE_URL", "https://www.consultx.app").rstrip("/")
SUPABASE_URL = os.environ.get(
    "CONSULTX_SUPABASE_URL", "https://hrnltxmwoaphgejckutk.supabase.co"
).rstrip("/")
SUPABASE_ANON_KEY = env_value("CONSULTX_SUPABASE_ANON_KEY")

CHAT_URL = f"{SUPABASE_URL}/functions/v1/fire-safety-chat"
CHECK_SUBSCRIPTION_URL = f"{SUPABASE_URL}/functions/v1/check-subscription"

TEST_EMAIL = env_value("CONSULTX_TEST_EMAIL")
TEST_PASSWORD = env_value("CONSULTX_TEST_PASSWORD")

E2E_DIR = Path(__file__).parent


def get_anon_key() -> str:
    """Return the Supabase anon key.

    Priority:
        1. CONSULTX_SUPABASE_ANON_KEY environment variable.
        2. Discover from the deployed frontend bundle (fallback only).

    Raises:
        RuntimeError: if the anon key cannot be obtained.
    """
    if SUPABASE_ANON_KEY:
        return SUPABASE_ANON_KEY

    # Fallback: discover the hashed JS asset filename from the HTML page.
    try:
        html = httpx.get(BASE_URL, timeout=60).text
        match = re.search(r"/assets/index-[A-Za-z0-9_\-]+\.js", html)
        if not match:
            raise RuntimeError("Could not discover frontend JS asset filename")
        js_path = match.group(0)
        js = httpx.get(f"{BASE_URL}{js_path}", timeout=60).text
        key_match = re.search(
            r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", js
        )
        if not key_match:
            raise RuntimeError("Could not extract anon key from frontend bundle")
        return key_match.group(0)
    except Exception as exc:
        raise RuntimeError(
            "Failed to obtain Supabase anon key. "
            "Set CONSULTX_SUPABASE_ANON_KEY or ensure BASE_URL is reachable."
        ) from exc


def require_test_credentials() -> tuple[str, str]:
    """Return (email, password) from environment variables.

    Raises:
        RuntimeError: if credentials are not configured.
    """
    if not TEST_EMAIL or not TEST_PASSWORD:
        raise RuntimeError(
            "Test credentials not configured. "
            "Set CONSULTX_TEST_EMAIL and CONSULTX_TEST_PASSWORD."
        )
    return TEST_EMAIL, TEST_PASSWORD


def login(email: str, password: str) -> str:
    """Authenticate and return an access token."""
    anon = get_anon_key()
    r = httpx.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": anon, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    """Return headers needed for authenticated Edge Function calls."""
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "apikey": get_anon_key(),
    }
