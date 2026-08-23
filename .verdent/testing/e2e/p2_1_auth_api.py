"""Phase 2 P2.1 — Registration / Authentication API-level E2E.

Tests the real production Supabase Auth flow:
1. Sign up via Auth REST API
2. Retrieve confirmation email from Gmail
3. Confirm email by following the Supabase confirmation link
4. Sign in with password
5. Validate session/access token
6. Sign out / token invalidation

Uses the public anon key extracted from the deployed frontend bundle.
"""
import os
import re
import sys
import time
import json
from datetime import datetime, timezone

import httpx

BASE_URL = "https://www.consultx.app"
PROJECT_REF = "hrnltxmwoaphgejckutk"
DEFAULT_EMAIL = "njajrehwaseem+consultxphase2test1@gmail.com"
TEST_PASSWORD = os.environ["CONSULTX_TEST_PASSWORD"]

def get_test_email():
    try:
        with open(".verdent/testing/e2e/p2_1_auth_state.json", "r", encoding="utf-8") as f:
            return json.load(f).get("email", DEFAULT_EMAIL)
    except Exception:
        return DEFAULT_EMAIL


def get_supabase_credentials():
    """Extract public Supabase URL and anon key from the deployed frontend bundle."""
    js_url = f"{BASE_URL}/assets/index-CkDqZeyh.js"
    r = httpx.get(js_url, timeout=60)
    r.raise_for_status()
    text = r.text
    url_match = re.search(r"https://hrnltxmwoaphgejckutk\.supabase\.co", text)
    key_match = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", text)
    if not url_match or not key_match:
        raise RuntimeError("Could not extract Supabase credentials from frontend bundle")
    return url_match.group(0), key_match.group(0)


def signup(supabase_url: str, anon_key: str):
    email = get_test_email()
    headers = {"apikey": anon_key, "Content-Type": "application/json"}
    body = {
        "email": email,
        "password": TEST_PASSWORD,
        "options": {"emailRedirectTo": f"{BASE_URL}/"},
    }
    r = httpx.post(f"{supabase_url}/auth/v1/signup", headers=headers, json=body, timeout=30)
    print("signup status:", r.status_code)
    if r.status_code not in (200, 201):
        print("signup response:", r.text[:500])
    r.raise_for_status()
    data = r.json()
    # If identities is non-empty, user was created and may need confirmation.
    return data


def signin(supabase_url: str, anon_key: str):
    headers = {"apikey": anon_key, "Content-Type": "application/json"}
    body = {"email": TEST_EMAIL, "password": TEST_PASSWORD}
    r = httpx.post(f"{supabase_url}/auth/v1/token?grant_type=password", headers=headers, json=body, timeout=30)
    print("signin status:", r.status_code)
    if r.status_code != 200:
        print("signin response:", r.text[:500])
    r.raise_for_status()
    return r.json()


def get_user(supabase_url: str, access_token: str):
    headers = {"Authorization": f"Bearer {access_token}"}
    r = httpx.get(f"{supabase_url}/auth/v1/user", headers=headers, timeout=30)
    return r.status_code, r.json() if r.status_code == 200 else r.text


def signout(supabase_url: str, access_token: str):
    headers = {"Authorization": f"Bearer {access_token}", "apikey": access_token}
    r = httpx.post(f"{supabase_url}/auth/v1/logout", headers=headers, timeout=30)
    return r.status_code


if __name__ == "__main__":
    print("Extracting Supabase credentials from production bundle...")
    supabase_url, anon_key = get_supabase_credentials()
    print("Credentials extracted (URL and public anon key)")

    print("\nSigning up test user...")
    signup_data = signup(supabase_url, anon_key)
    print("Signup response keys:", list(signup_data.keys()))

    if signup_data.get("identities"):
        print("User created. Email confirmation required (mailer_autoconfirm=false).")
        print("NEXT: retrieve confirmation link from Gmail and confirm.")
        # Write state for next step
        state = {
            "supabase_url": supabase_url,
            "email": get_test_email(),
            "password": TEST_PASSWORD,
            "user_id": signup_data.get("user", {}).get("id"),
        }
        with open(".verdent/testing/e2e/p2_1_auth_state.json", "w", encoding="utf-8") as f:
            json.dump(state, f)
    else:
        print("Unexpected: no identities in signup response")
        sys.exit(1)
