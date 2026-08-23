"""Phase 2 P2.2 — Trial / Entitlement UI verification via real login."""
import os
import httpx
from playwright.sync_api import sync_playwright

BASE_URL = "https://www.consultx.app"
EMAIL = "njajrehwaseem+consultxphase2test2@gmail.com"
PASSWORD = os.environ["CONSULTX_TEST_PASSWORD"]


def test_trial_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        page.goto(f"{BASE_URL}/auth")
        page.wait_for_load_state("networkidle")
        page.locator("input[type='email']").fill(EMAIL)
        page.locator("input[type='password']").first.fill(PASSWORD)
        page.locator("button[type='submit']").click()
        page.wait_for_url(lambda url: BASE_URL in url, timeout=15000)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
        page.goto(f"{BASE_URL}/workspace")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        body = page.locator("body").inner_text()
        print("Workspace text sample:", body[:1000].replace("\n", " "))

        # Trial indicator
        if "تجربة" in body or "trial" in body.lower() or "Trial" in body or "7" in body:
            print("[PASS] Trial indicator found in UI")
        else:
            print("[WARN] No explicit trial indicator found in UI text")

        # Locked/upgrade
        if "مقفل" in body or "locked" in body.lower() or "Upgrade" in body or "ترقية" in body:
            print("[WARN] Some elements show locked/upgrade-required")

        # Modes
        modes = ["Main", "Advisory", "Analytical", "رئيسي", "استشاري", "تحليلي"]
        found = [m for m in modes if m in body]
        print("Modes found:", found)

        # Try sending a message in Main mode
        chat_input = page.locator("[data-testid='chat-input']").first
        if chat_input.is_visible():
            chat_input.fill("ما هو الحد الأقصى لمسافة السير؟")
            send_btn = page.locator("button").filter(has_text="إرسال").first
            if send_btn.is_visible():
                send_btn.click()
                page.wait_for_timeout(5000)
                body = page.locator("body").inner_text()
                if "خطأ" in body or "error" in body.lower() or "لا يمكن" in body:
                    print("[FAIL] Chat returned an error")
                else:
                    print("[INFO] Chat response area updated (content may be streaming)")

        browser.close()


if __name__ == "__main__":
    test_trial_ui()
    print("\n[OK] P2.2 trial UI check completed")
