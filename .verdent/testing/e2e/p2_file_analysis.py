"""Phase 2 — File upload + Advisory/Analytical analysis test."""
import os
import json
import re
import time

import httpx
from playwright.sync_api import sync_playwright

BASE_URL = "https://www.consultx.app"
EMAIL = "njajrehwaseem+consultxrelease1@gmail.com"
PASSWORD = os.environ["CONSULTX_TEST_PASSWORD"]


def test_file_analysis():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        # Login
        page.goto(f"{BASE_URL}/auth")
        page.wait_for_load_state("networkidle")
        page.locator("input[type='email']").fill(EMAIL)
        page.locator("input[type='password']").first.fill(PASSWORD)
        page.locator("button[type='submit']").click()
        page.wait_for_url(lambda url: BASE_URL in url, timeout=15000)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        # Go to workspace
        page.goto(f"{BASE_URL}/workspace")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        # Wait for chat composer
        page.wait_for_selector("textarea", timeout=15000)

        # Upload file
        upload_btn = page.locator("button").filter(has_text=re.compile("رفع|Upload|upload", re.I)).first
        if not upload_btn.is_visible():
            upload_btn = page.locator("button svg[data-slot='paperclip']").locator("..").first
        if upload_btn.is_visible():
            upload_btn.click()
            page.wait_for_timeout(500)

        file_input = page.locator("input[type='file']").first
        if file_input.count() > 0:
            file_input.set_input_files(".verdent/testing/e2e/test_sbc201.pdf")
            page.wait_for_timeout(3000)
            body = page.locator("body").inner_text()
            print("After upload:", body[:600].replace("\n", " "))
            if "جاري معالجة" in body or "processing" in body.lower():
                print("[PASS] File accepted and processing")
            # Wait for processing
            for _ in range(10):
                page.wait_for_timeout(2000)
                body = page.locator("body").inner_text()
                if "جاري معالجة" not in body and "processing" not in body.lower():
                    break
            print("Processing done or timeout")

            # Ask advisory question
            page.locator("textarea").fill("ما هي الملاحظات الاستشارية على هذا الملف؟")
            send_btn = page.locator("button[type='submit']").first
            if send_btn.is_visible():
                send_btn.click()
            else:
                page.keyboard.press("Enter")
            # Wait for advisory response to complete
            for _ in range(30):
                page.wait_for_timeout(1000)
                body = page.locator("body").inner_text()
                if "يعمل على إجابتك" not in body and "جارٍ العمل" not in body and "الرجاء الانتظار" not in body:
                    break
            print("After advisory question:", body[-2000:].replace("\n", " "))

            # Switch to analytical and ask
            analytical_btn = page.locator("button").filter(has_text="تحليلي").first
            if analytical_btn.is_visible():
                analytical_btn.click()
                page.wait_for_timeout(1500)
                page.locator("textarea").fill("حلل الامتثال في هذا الملف")
                send_btn = page.locator("button[type='submit']").first
                if send_btn.is_visible():
                    send_btn.click()
                else:
                    page.keyboard.press("Enter")
                for _ in range(30):
                    page.wait_for_timeout(1000)
                    body = page.locator("body").inner_text()
                    if "يعمل على إجابتك" not in body and "جارٍ العمل" not in body and "الرجاء الانتظار" not in body:
                        break
                print("After analytical question:", body[-2000:].replace("\n", " "))
        else:
            print("[WARN] File input not found")

        browser.close()


if __name__ == "__main__":
    test_file_analysis()
    print("\n[OK] File analysis test completed")
