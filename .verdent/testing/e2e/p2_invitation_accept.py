"""Phase 2 — Accept enterprise invitation after email verification."""
import json

import httpx
from playwright.sync_api import sync_playwright

BASE_URL = "https://www.consultx.app"
SUPABASE_URL = "https://hrnltxmwoaphgejckutk.supabase.co"
VERIFY_LINK = "https://hrnltxmwoaphgejckutk.supabase.co/auth/v1/verify?token=3099565d26e17aca7616325f27b8804ac759f47913de436715d08219&type=signup&redirect_to=https://www.consultx.app"


def get_anon_key():
    import re
    js = httpx.get(f"{BASE_URL}/assets/index-CkDqZeyh.js", timeout=60).text
    return re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", js).group(0)


if __name__ == "__main__":
    state = json.load(open(".verdent/testing/e2e/p2_invitation_state.json", encoding="utf-8"))
    invite_token = state["invite_token"]
    invited_email = state["invited_email"]
    invited_password = state["invited_password"]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        # 1. Verify email
        print("Verifying invited user email...")
        page.goto(VERIFY_LINK)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
        print("URL after verification:", page.url)

        # 2. Log in (verification may have auto-logged in)
        print("Logging in as invited user...")
        page.goto(f"{BASE_URL}/auth")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1000)
        body = page.locator("body").inner_text()
        if "تسجيل الدخول" in body or "Sign in" in body or "input[type='email']" in page.content():
            page.locator("input[type='email']").fill(invited_email)
            page.locator("input[type='password']").first.fill(invited_password)
            page.locator("button[type='submit']").click()
            page.wait_for_url(lambda url: BASE_URL in url, timeout=15000)
            page.wait_for_timeout(2000)
        else:
            print("Already logged in after verification")

        # 3. Accept invitation via UI route
        accept_url = f"{BASE_URL}/accept-invite?token={invite_token}"
        print("Navigating to:", accept_url)
        page.goto(accept_url)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        body = page.locator("body").inner_text()
        print("Accept-invite page text:", body[:1000].replace("\n", " "))

        if "error" in body.lower() or "خطأ" in body or "فشل" in body or "Could not" in body:
            print("[FAIL] Invitation acceptance returned an error")
        elif "active member" in body.lower() or "عضو نشط" in body or "enterprise workspace" in body.lower():
            print("[PASS] Invitation accepted successfully")
        else:
            print("[INFO] Invitation acceptance result unclear from page text")

        browser.close()

    print("\n[OK] Invitation acceptance flow completed")
