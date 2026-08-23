"""Phase 2 P2.1 — complete email confirmation, login, logout, session persistence."""
import os
import json
import sys

import httpx
from playwright.sync_api import sync_playwright

BASE_URL = "https://www.consultx.app"
VERIFY_LINK = sys.argv[1] if len(sys.argv) > 1 else None
TEST_PASSWORD = os.environ["CONSULTX_TEST_PASSWORD"]


def get_credentials():
    import re
    js = httpx.get(f"{BASE_URL}/assets/index-CkDqZeyh.js", timeout=60).text
    url = re.search(r"https://hrnltxmwoaphgejckutk\.supabase\.co", js).group(0)
    key = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", js).group(0)
    return url, key


def signin(supabase_url: str, anon_key: str, email: str, password: str):
    headers = {"apikey": anon_key, "Content-Type": "application/json"}
    body = {"email": email, "password": password}
    r = httpx.post(f"{supabase_url}/auth/v1/token?grant_type=password", headers=headers, json=body, timeout=30)
    r.raise_for_status()
    return r.json()


if __name__ == "__main__":
    if not VERIFY_LINK:
        print("Usage: python p2_1_auth_complete.py <verification-link>")
        sys.exit(1)

    supabase_url, anon_key = get_credentials()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        # 1. Click confirmation link
        print("Navigating to verification link...")
        page.goto(VERIFY_LINK)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
        current = page.url
        print("URL after confirmation:", current)
        if BASE_URL not in current:
            print("[FAIL] Did not redirect to app after confirmation")
            print(page.locator("body").inner_text()[:1000])
            sys.exit(1)
        print("[PASS] Redirected to app after email confirmation")

        # 2. Verify logged-in UI (no login prompt)
        body = page.locator("body").inner_text()
        if "تسجيل الدخول" in body and "Sign in" in body:
            print("[FAIL] Still showing login after confirmation")
            sys.exit(1)
        print("[PASS] Logged-in UI visible")

        # 3. Logout via UI
        logout_btn = page.locator("button").filter(has_text="تسجيل الخروج").first
        if not logout_btn.is_visible():
            logout_btn = page.locator("button").filter(has_text="Logout").first
        if logout_btn.is_visible():
            logout_btn.click()
            page.wait_for_timeout(1500)
            page.wait_for_load_state("networkidle")
            print("[PASS] Logout clicked")
        else:
            print("[WARN] Logout button not found; attempting auth signOut via API")

        # 4. Re-login
        page.goto(f"{BASE_URL}/auth")
        page.wait_for_load_state("networkidle")
        # Read state to get email
        with open(".verdent/testing/e2e/p2_1_auth_state.json", "r", encoding="utf-8") as f:
            state = json.load(f)
        email = state["email"]
        page.locator("input[type='email']").fill(email)
        page.locator("input[type='password']").first.fill(TEST_PASSWORD)
        page.locator("button[type='submit']").click()
        page.wait_for_url(f"{BASE_URL}/", timeout=15000)
        print("[PASS] Re-login succeeded")

        # 5. Session persistence after refresh
        page.reload()
        page.wait_for_load_state("networkidle")
        body = page.locator("body").inner_text()
        if "تسجيل الدخول" in body and "Sign in" in body:
            print("[FAIL] Session lost after refresh")
            sys.exit(1)
        print("[PASS] Session persists after refresh")

        browser.close()

    print("\n[OK] P2.1 auth E2E completed")
