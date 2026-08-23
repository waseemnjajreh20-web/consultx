import json
import re
import sys

import httpx

BASE_URL = "https://www.consultx.app"
CHAT_URL = "https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat"
import os

EMAIL = os.environ.get("CONSULTX_TEST_EMAIL", "")
PASSWORD = os.environ.get("CONSULTX_TEST_PASSWORD", "")
if not EMAIL or not PASSWORD:
    raise SystemExit("Set CONSULTX_TEST_EMAIL and CONSULTX_TEST_PASSWORD (never hardcode credentials).")


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


def chat(token: str, mode: str, message: str, language: str = "en"):
    body = {
        "messages": [{"role": "user", "content": message}],
        "retry": False,
        "mode": mode,
        "language": language,
        "preferred_standards": ["SBC-201", "SBC-801"],
    }
    anon = get_anon_key()
    with httpx.stream(
        "POST",
        CHAT_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "apikey": anon,
        },
        json=body,
        timeout=90,
    ) as resp:
        print(f"[{mode}] status={resp.status_code} headers={dict(resp.headers)}")
        if not resp.is_success:
            text = resp.read().decode("utf-8", errors="ignore")
            print(f"  ERROR: {text[:500]}")
            return
        content = ""
        lines_seen = 0
        for line in resp.iter_lines():
            lines_seen += 1
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
        print(f"  lines={lines_seen} length={len(content)} answer={content[:200]!r}")


if __name__ == "__main__":
    token = login(EMAIL, PASSWORD)
    print("JWT obtained")
    chat(token, "primary", "What is ConsultX?", "en")
    chat(token, "standard", "ما هي متطلبات نظام الإنذار في SBC 801؟", "ar")
    chat(token, "analysis", "قارن بين SBC 201 و SBC 801 من حيث نظام الإنذار", "ar")
    print("smoke done")
