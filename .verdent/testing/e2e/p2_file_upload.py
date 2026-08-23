"""Phase 2 — Chat file upload test."""
import os
import httpx
import re
from playwright.sync_api import sync_playwright

BASE_URL = "https://www.consultx.app"
EMAIL = "njajrehwaseem+consultxrelease1@gmail.com"
PASSWORD = os.environ["CONSULTX_TEST_PASSWORD"]


def test_file_upload():
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
        page.wait_for_timeout(3000)
        # Confirm session persisted before navigating
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        # Navigate to workspace/chat - look for chat input
        page.goto(f"{BASE_URL}/workspace")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        # Click New Chat or similar to enter chat
        new_chat_btn = page.locator("button").filter(has_text=re.compile("New chat|محادثة جديدة|New Chat")).first
        if new_chat_btn.is_visible():
            new_chat_btn.click()
            page.wait_for_timeout(1000)

        # Wait for chat composer
        page.wait_for_selector("textarea", timeout=15000)
        page.wait_for_timeout(1000)

        # Click the paperclip/upload button to trigger hidden file input
        upload_btn = page.locator("button").filter(has_text=re.compile("رفع|Upload|upload", re.I)).first
        if not upload_btn.is_visible():
            upload_btn = page.locator("button svg[data-slot='paperclip']").locator("..").first
        if upload_btn.is_visible():
            upload_btn.click()
            page.wait_for_timeout(500)

        # Find hidden file input
        file_input = page.locator("input[type='file']").first
        if file_input.count() > 0:
            file_input.set_input_files(".verdent/testing/e2e/test_sbc201.pdf")
            page.wait_for_timeout(3000)
            body = page.locator("body").inner_text()
            print("Body after upload:", body[:800].replace("\n", " "))
            if "خطأ" in body or "error" in body.lower() or "فشل" in body:
                print("[FAIL] Upload error visible")
            else:
                print("[PASS] File upload accepted by UI")
        else:
            print("[WARN] File input not found")

        browser.close()


if __name__ == "__main__":
    test_file_upload()
    print("\n[OK] File upload test completed")
