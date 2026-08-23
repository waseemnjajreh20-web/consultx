import json
import re

import httpx

BASE_URL = "https://www.consultx.app"
import os

EMAIL = os.environ.get("CONSULTX_TEST_EMAIL", "")
PASSWORD = os.environ.get("CONSULTX_TEST_PASSWORD", "")
if not EMAIL or not PASSWORD:
    raise SystemExit("Set CONSULTX_TEST_EMAIL and CONSULTX_TEST_PASSWORD (never hardcode credentials).")


def get_anon_key():
    js = httpx.get(f"{BASE_URL}/assets/index-CkDqZeyh.js", timeout=60).text
    return re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", js).group(0)


def login(email: str, password: str):
    anon = get_anon_key()
    r = httpx.post(
        "https://hrnltxmwoaphgejckutk.supabase.co/auth/v1/token?grant_type=password",
        headers={"apikey": anon, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def check_subscription(token: str):
    anon = get_anon_key()
    r = httpx.post(
        "https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/check-subscription",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "apikey": anon,
        },
        json={},
        timeout=30,
    )
    print("check-subscription status:", r.status_code)
    print(json.dumps(r.json(), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    token = login(EMAIL, PASSWORD)
    check_subscription(token)
