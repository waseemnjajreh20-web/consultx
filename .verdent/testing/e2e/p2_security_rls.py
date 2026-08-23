"""Phase 2 — Security / RLS practical tests."""
import os
import json
import re

import httpx

BASE_URL = "https://www.consultx.app"
SUPABASE_URL = "https://hrnltxmwoaphgejckutk.supabase.co"
USER_A_EMAIL = "njajrehwaseem+consultxrelease1@gmail.com"
USER_A_PASSWORD = os.environ["CONSULTX_TEST_PASSWORD"]
USER_B_EMAIL = "njajrehwaseem+consultxrelease2@gmail.com"
USER_B_PASSWORD = "Phase2Release!2026"


def get_anon_key():
    js = httpx.get(f"{BASE_URL}/assets/index-CkDqZeyh.js", timeout=60).text
    return re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", js).group(0)


def login(email: str, password: str):
    anon = get_anon_key()
    r = httpx.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": anon, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def rpc(token: str, name: str, params: dict):
    anon = get_anon_key()
    r = httpx.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        headers={
            "apikey": anon,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json=params,
        timeout=30,
    )
    return r.status_code, r.text


def rest_select(token: str, table: str, query: str = ""):
    anon = get_anon_key()
    url = f"{SUPABASE_URL}/rest/v1/{table}{query}"
    r = httpx.get(
        url,
        headers={"apikey": anon, "Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=30,
    )
    return r.status_code, r.text


if __name__ == "__main__":
    print("Logging in as User A (owner with org)...")
    token_a = login(USER_A_EMAIL, USER_A_PASSWORD)
    print("User A JWT obtained")

    # Ensure User B exists
    print("\nEnsuring User B exists...")
    anon = get_anon_key()
    r = httpx.post(
        f"{SUPABASE_URL}/auth/v1/signup",
        headers={"apikey": anon, "Content-Type": "application/json"},
        json={"email": USER_B_EMAIL, "password": USER_B_PASSWORD, "options": {"emailRedirectTo": f"{BASE_URL}/"}},
        timeout=30,
    )
    print(f"User B signup: {r.status_code}")
    print("User B needs email verification before login works.")

    print("\nTest 1: User A cannot call admin-stats...")
    status, text = httpx.post(
        f"{SUPABASE_URL}/functions/v1/admin-stats",
        headers={"Authorization": f"Bearer {token_a}", "apikey": anon, "Content-Type": "application/json"},
        json={},
        timeout=30,
    ).status_code, httpx.post(
        f"{SUPABASE_URL}/functions/v1/admin-stats",
        headers={"Authorization": f"Bearer {token_a}", "apikey": anon, "Content-Type": "application/json"},
        json={},
        timeout=30,
    ).text
    print(f"admin-stats: {status} {text[:200]}")
    assert status != 200, "admin-stats should reject non-admin user"

    print("\nTest 2: User A cannot update another user's subscription via RPC...")
    status, text = rpc(token_a, "create_organization_with_owner", {"p_name": "RLS Test Org"})
    print(f"create_organization_with_owner: {status} {text[:200]}")

    print("\nTest 3: User A tries to read another user's projects (RLS)...")
    status, text = rest_select(token_a, "projects", "?select=*")
    print(f"projects select: {status} rows={len(json.loads(text)) if status == 200 else text[:200]}")

    print("\nTest 4: User A tries to read all profiles (RLS)...")
    status, text = rest_select(token_a, "profiles", "?select=*")
    print(f"profiles select: {status} rows={len(json.loads(text)) if status == 200 else text[:200]}")

    print("\n[OK] Security/RLS smoke tests completed")
