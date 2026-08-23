"""Inspect workspace UI."""
from playwright.sync_api import sync_playwright

BASE_URL = "https://www.consultx.app"
EMAIL = "njajrehwaseem+consultxrelease1@gmail.com"
PASSWORD = os.environ["CONSULTX_TEST_PASSWORD"]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
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
    page.goto(f"{BASE_URL}/workspace")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)
    print("URL:", page.url)
    print("Title:", page.title())
    body = page.locator("body").inner_text()
    print("Body:", body[:2000].replace("\n", " "))
    # list buttons
    buttons = page.locator("button").all_inner_texts()
    print("Buttons:", [b.strip() for b in buttons if b.strip()][:30])
    browser.close()
