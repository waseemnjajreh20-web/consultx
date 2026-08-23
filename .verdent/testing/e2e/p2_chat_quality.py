"""Phase 2 — AI mode/citation quality API-level validation.

Logs in a real test user and calls the production fire-safety-chat function
for Main (primary), Advisory (standard), and Analytical (analysis) modes.
Collects the streamed response, source headers, and basic quality signals.
"""
import os
import json
import re
import sys

import httpx

BASE_URL = "https://www.consultx.app"
CHAT_URL = "https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat"
EMAIL = "njajrehwaseem+consultxphase2test2@gmail.com"
PASSWORD = os.environ["CONSULTX_TEST_PASSWORD"]


def get_anon_key():
    js = httpx.get(f"{BASE_URL}/assets/index-CkDqZeyh.js", timeout=60).text
    m = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", js)
    if not m:
        raise RuntimeError("anon key not found")
    return m.group(0)


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


def chat(token: str, mode: str, message: str, language: str = "ar", preferred_standards=None):
    body = {
        "messages": [{"role": "user", "content": message}],
        "retry": False,
        "mode": mode,
        "language": language,
        "preferred_standards": preferred_standards or ["SBC-201", "SBC-801"],
    }
    with httpx.stream(
        "POST",
        CHAT_URL,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        json=body,
        timeout=120,
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
    print("Logging in test user...")
    token = login(EMAIL, PASSWORD)
    print("JWT obtained")

    questions = [
        ("primary", "ar", "ما هو الحد الأقصى لمسافة السير في المباني السكنية؟"),
        ("standard", "ar", "ما هي متطلبات فتحات التهوئة في SBC 201 للمباني التجارية؟"),
        ("analysis", "ar", "قارن بين متطلبات نظام الإنذار في SBC 201 و SBC 801"),
    ]

    results = []
    for mode, lang, q in questions:
        print(f"\n[{mode}] {q}")
        try:
            res = chat(token, mode, q, lang)
            results.append(res)
            print(f"  answer length: {len(res['answer'])}")
            print(f"  sources: {res['sources_header']}")
            print(f"  source_meta count: {len(res['source_meta'])}")
        except Exception as e:
            print(f"  ERROR: {e}")
            results.append({"mode": mode, "error": str(e)})

    with open(".verdent/testing/e2e/p2_chat_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("\nResults saved to .verdent/testing/e2e/p2_chat_results.json")
