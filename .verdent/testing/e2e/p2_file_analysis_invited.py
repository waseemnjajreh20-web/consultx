"""Phase 2 — File upload + analysis for invited test user."""
import re
import time
from playwright.sync_api import sync_playwright

BASE_URL = "https://www.consultx.app"
EMAIL = "njajrehwaseem+consultxinvite1@gmail.com"
PASSWORD = "Phase2Invite!2026"


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

        # Go to workspace
        page.goto(f"{BASE_URL}/workspace")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        # Try to create a new project / case
        new_project_btn = page.locator("button").filter(has_text=re.compile("New project|مشروع جديد|New Project|Create project", re.I)).first
        if new_project_btn.is_visible():
            new_project_btn.click()
            page.wait_for_timeout(1000)
            # Fill project name if dialog appears
            inputs = page.locator("input").all()
            for inp in inputs:
                if inp.is_visible():
                    inp.fill("P2 File Analysis Test")
                    break
            create_btn = page.locator("button").filter(has_text=re.compile("Create|إنشاء|Save", re.I)).first
            if create_btn.is_visible():
                create_btn.click()
                page.wait_for_timeout(2000)

        # Try to find chat/file upload area
        page.wait_for_selector("textarea", timeout=15000)
        page.wait_for_timeout(1000)

        # Click upload button
        upload_btn = page.locator("button").filter(has_text=re.compile("رفع|Upload|upload", re.I)).first
        if not upload_btn.is_visible():
            upload_btn = page.locator("button svg[data-slot='paperclip']").locator("..").first
        if upload_btn.is_visible():
            upload_btn.click()
            page.wait_for_timeout(500)

        # Upload PDF
        file_input = page.locator("input[type='file']").first
        if file_input.count() > 0:
            file_input.set_input_files(".verdent/testing/e2e/test_sbc201.pdf")
            page.wait_for_timeout(5000)
            body = page.locator("body").inner_text()
            print("Body after upload:", body[:1000].replace("\n", " "))

            # Ask advisory question about the PDF
            page.locator("textarea").first.fill("ما المتطلبات الرئيسية لنظام إنذار الحريق في هذا المشروع؟")
            send_btn = page.locator("button[type='submit']").first
            if not send_btn.is_visible():
                send_btn = page.locator("button").filter(has_text=re.compile("Send|إرسال| send", re.I)).first
            send_btn.click()
            page.wait_for_timeout(15000)
            body = page.locator("body").inner_text()
            print("After advisory question:", body[-1500:].replace("\n", " "))

            # Switch to analytical and ask
            analysis_tab = page.locator("button").filter(has_text=re.compile("Analysis|تحليل|Analytical", re.I)).first
            if analysis_tab.is_visible():
                analysis_tab.click()
                page.wait_for_timeout(1000)
                page.locator("textarea").first.fill("قارن بين متطلبات الملف ومقتضيات SBC 201")
                send_btn.click()
                page.wait_for_timeout(15000)
                body = page.locator("body").inner_text()
                print("After analytical question:", body[-1500:].replace("\n", " "))
        else:
            print("[WARN] File input not found")

        browser.close()


if __name__ == "__main__":
    test_file_analysis()
    print("\n[OK] File analysis test completed")
