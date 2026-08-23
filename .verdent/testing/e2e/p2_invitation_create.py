"""Phase 2 — Enterprise invitation flow end-to-end test."""
import os
import json
import re
import time

import httpx

BASE_URL = "https://www.consultx.app"
SUPABASE_URL = "https://hrnltxmwoaphgejckutk.supabase.co"
OWNER_EMAIL = "njajrehwaseem+consultxrelease1@gmail.com"
OWNER_PASSWORD = os.environ["CONSULTX_TEST_PASSWORD"]
INVITED_EMAIL = "njajrehwaseem+consultxinvite1@gmail.com"


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


if __name__ == "__main__":
    print("Logging in as owner...")
    owner_token = login(OWNER_EMAIL, OWNER_PASSWORD)
    print("Owner JWT obtained")

    print("\nCreating organization...")
    status, text = rpc(owner_token, "create_organization_with_owner", {"p_name": "Phase2 Release Test Org"})
    print(f"create_organization_with_owner: {status} {text[:500]}")
    if status != 200:
        raise RuntimeError("Failed to create organization")
    org_id = json.loads(text)
    print(f"Org ID: {org_id}")

    print("\nInviting member...")
    status, text = rpc(
        owner_token,
        "create_org_invitation_enforced",
        {"p_org_id": org_id, "p_email": INVITED_EMAIL, "p_role": "engineer"},
    )
    print(f"create_org_invitation_enforced: {status} {text[:1000]}")
    if status != 200:
        raise RuntimeError("Failed to create invitation")
    invite = json.loads(text) if text.startswith("{") else json.loads(text)[0]
    print(f"Invitation token: {invite['token']}")

    print("\nWaiting for invitation email...")
    time.sleep(10)

    print("\nSignup invited user via Auth API...")
    anon = get_anon_key()
    r = httpx.post(
        f"{SUPABASE_URL}/auth/v1/signup",
        headers={"apikey": anon, "Content-Type": "application/json"},
        json={"email": INVITED_EMAIL, "password": os.environ["CONSULTX_INVITED_PASSWORD"], "options": {"emailRedirectTo": f"{BASE_URL}/"}},
        timeout=30,
    )
    print(f"signup: {r.status_code} {r.text[:500]}")

    print("\nWaiting for verification email...")
    time.sleep(10)
    print("Please provide the verification link, then run p2_invitation_accept.py")

    with open(".verdent/testing/e2e/p2_invitation_state.json", "w", encoding="utf-8") as f:
        json.dump({"org_id": org_id, "invite_token": invite["token"], "invited_email": INVITED_EMAIL, "invited_password": os.environ["CONSULTX_INVITED_PASSWORD"]}, f)
    print("State saved to .verdent/testing/e2e/p2_invitation_state.json")
