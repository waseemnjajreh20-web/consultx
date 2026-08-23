"""Phase 2 — File analysis via API using documentTexts (invited user)."""
import json
import re
from pathlib import Path

import fitz
import httpx

BASE_URL = "https://www.consultx.app"
CHAT_URL = "https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat"
import os

EMAIL = os.environ.get("CONSULTX_TEST_EMAIL", "")
PASSWORD = os.environ.get("CONSULTX_TEST_PASSWORD", "")
if not EMAIL or not PASSWORD:
    raise SystemExit("Set CONSULTX_TEST_EMAIL and CONSULTX_TEST_PASSWORD (never hardcode credentials).")
PDF_PATH = Path(__file__).parent / "test_sbc201.pdf"


def get_anon_key():
    js = httpx.get(f"{BASE_URL}/assets/index-CkDqZeyh.js", timeout=60).text
    return re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", js).group(0)


def login(email: str, password: str):
    anon = get_anon_key()
    r = httpx.post(
        "https://hrnltxmwoaphgejckutk.supabase.co/auth/v1/token?grant_type=password",
        headers={"apikey": anon, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def extract_text(path: str) -> str:
    doc = fitz.open(path)
    text = "\n".join(page.get_text() for page in doc)
    doc.close()
    return text


def chat_with_document(token: str, mode: str, message: str, doc_text: str, language: str = "ar"):
    body = {
        "messages": [{"role": "user", "content": message}],
        "retry": False,
        "mode": mode,
        "language": language,
        "preferred_standards": ["SBC-201", "SBC-801"],
        "documentTexts": [{"name": "test_sbc201.pdf", "content": doc_text[:12000]}],
    }
    with httpx.stream(
        "POST",
        CHAT_URL,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}", "apikey": get_anon_key()},
        json=body,
        timeout=180,
    ) as resp:
        if not resp.is_success:
            text = resp.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"chat {mode} failed {resp.status_code}: {text[:500]}")
        sources = resp.headers.get("X-SBC-Sources", "")
        source_meta = resp.headers.get("X-SBC-Source-Meta", "")
        content = ""
        for line in resp.iter_lines():
            if line.startswith("data: "):
                payload = line[6:].strip()
                if payload == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                    delta = data.get("choices", [{}])[0].get("delta", {}).get("content")
                    if delta:
                        content += delta
                except Exception:
                    pass
    return {
        "mode": mode,
        "language": language,
        "question": message,
        "answer": content,
        "sources_header": sources,
        "source_meta": json.loads(source_meta) if source_meta else [],
    }


if __name__ == "__main__":
    token = login(EMAIL, PASSWORD)
    print("JWT obtained")
    doc_text = extract_text(PDF_PATH)
    print(f"Extracted {len(doc_text)} chars from PDF\n")

    # Advisory file analysis
    print("[advisory file analysis]")
    res = chat_with_document(token, "standard", "ما المتطلبات الرئيسية لنظام إنذار الحريق في هذا المشروع؟", doc_text, "ar")
    print(f"  length={len(res['answer'])} sources={res['sources_header']} meta={len(res['source_meta'])}")
    print(f"  snippet={res['answer'][:300]!r}")

    # Analytical file analysis
    print("\n[analytical file analysis]")
    res = chat_with_document(token, "analysis", "قارن بين متطلبات الملف ومقتضيات SBC 201", doc_text, "ar")
    print(f"  length={len(res['answer'])} sources={res['sources_header']} meta={len(res['source_meta'])}")
    print(f"  snippet={res['answer'][:300]!r}")

    print("\n[OK] File analysis test completed")
