"""Shared helpers and configuration for ConsultX end-to-end tests.

Credentials and environment-specific values are read from environment
variables. Do not hardcode secrets in this file or in test scripts.
"""
import os
import re
from pathlib import Path

import httpx

BASE_URL = os.environ.get("CONSULTX_BASE_URL", "https://www.consultx.app").rstrip("/")
SUPABASE_URL = os.environ.get(
    "CONSULTX_SUPABASE_URL", "https://hrnltxmwoaphgejckutk.supabase.co"
).rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("CONSULTX_SUPABASE_ANON_KEY", "")

CHAT_URL = f"{SUPABASE_URL}/functions/v1/fire-safety-chat"
CHECK_SUBSCRIPTION_URL = f"{SUPABASE_URL}/functions/v1/check-subscription"

TEST_EMAIL = os.environ.get("CONSULTX_TEST_EMAIL", "")
TEST_PASSWORD = os.environ.get("CONSULTX_TEST_PASSWORD", "")

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
