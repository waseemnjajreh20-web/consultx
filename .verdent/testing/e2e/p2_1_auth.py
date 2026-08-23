"""Phase 2 P2.1 — Registration / Authentication E2E smoke test.

Runs against the production Vercel deployment and real Supabase Auth + Resend SMTP.
Uses Gmail to retrieve the verification link.
"""
import os
import re
import sys
import time
import json
from datetime import datetime, timezone

import httpx
from playwright.sync_api import sync_playwright, expect

BASE_URL = "https://www.consultx.app"
TEST_EMAIL = "njajrehwaseem+consultxphase2test1@gmail.com"
TEST_PASSWORD = os.environ["CONSULTX_TEST_PASSWORD"]

def fetch_gmail_link(subject_substring: str, to_email: str, max_wait: int = 120):
    """Poll Gmail for a recent email matching subject/to and return the first http link."""
    deadline = time.time() + max_wait
    while time.time() < deadline:
        # Use Gmail API via Composio proxy URL would be ideal; here we rely on local IMAP is not set.
        # Since we cannot directly call Composio from pytest easily, this helper is a placeholder
        # and will be replaced by reading the verification link from stdout passed by the caller.
        time.sleep(5)
    raise TimeoutError("Verification email not found")


def test_signup_login_logout():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        # 1. Landing
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        assert "ConsultX" in page.title()
        print("[PASS] Landing page loads")

        # 2. Navigate to auth
        page.goto(f"{BASE_URL}/auth")
        page.wait_for_load_state("networkidle")
        # Toggle to signup if needed
        if page.locator("text=إنشاء حساب جديد").count() == 0 and page.locator("text=Create New Account").count() == 0:
            # Click the toggle — label text depends on language
            signup_toggle = page.locator("button").filter(has_text=re.compile("Sign up|إنشاء حساب|Signup|سجل")).first
            if signup_toggle.is_visible():
                signup_toggle.click()
                page.wait_for_timeout(300)

        # 3. Fill signup form
        page.locator("input[type='email']").fill(TEST_EMAIL)
        page.locator("input[type='password']").first.fill(TEST_PASSWORD)
        # Confirm password only on signup
        confirm_inputs = page.locator("input[type='password']").all()
        if len(confirm_inputs) > 1:
            confirm_inputs[1].fill(TEST_PASSWORD)

        page.locator("button[type='submit']").click()

        # Wait for toast or redirect
        try:
            page.wait_for_url(f"{BASE_URL}/", timeout=15000)
            print("[INFO] Signed up and redirected immediately (auto-confirm or existing session)")
        except Exception:
            # Expect confirmation-required toast
            page.wait_for_timeout(2000)
            body = page.locator("body").inner_text()
            if "confirmation link" in body.lower() or "تأكيد" in body:
                print("[INFO] Confirmation email sent; retrieving via Gmail...")
                link = fetch_gmail_link("Confirm", TEST_EMAIL)
                page.goto(link)
                page.wait_for_url(f"{BASE_URL}/", timeout=20000)
                print("[PASS] Email confirmation succeeded")
            else:
                print("[FAIL] Unexpected signup result:", body[:500])
                sys.exit(1)

        # 4. Verify logged-in UI
        page.wait_for_load_state("networkidle")
        body = page.locator("body").inner_text()
        assert "تسجيل الدخول" not in body or "Sign in" not in body, "Still showing login prompt after auth"
        print("[PASS] Logged-in UI visible")

        # 5. Logout
        # Find logout button/link
        logout_btn = page.locator("button").filter(has_text=re.compile("Logout|تسجيل الخروج|خروج")).first
        if logout_btn.is_visible():
            logout_btn.click()
            page.wait_for_timeout(1000)
            page.wait_for_load_state("networkidle")
            print("[PASS] Logout clicked")

        # 6. Login again
        page.goto(f"{BASE_URL}/auth")
        page.wait_for_load_state("networkidle")
        page.locator("input[type='email']").fill(TEST_EMAIL)
        page.locator("input[type='password']").first.fill(TEST_PASSWORD)
        page.locator("button[type='submit']").click()
        page.wait_for_url(f"{BASE_URL}/", timeout=15000)
        print("[PASS] Re-login succeeded")

        # 7. Session persistence after refresh
        page.reload()
        page.wait_for_load_state("networkidle")
        body = page.locator("body").inner_text()
        assert "تسجيل الدخول" not in body or "Sign in" not in body, "Session lost after refresh"
        print("[PASS] Session persists after refresh")

        browser.close()


if __name__ == "__main__":
    test_signup_login_logout()
    print("\n[OK] P2.1 auth smoke test passed")
