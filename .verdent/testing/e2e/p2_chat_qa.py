"""Phase 2 — AI chat quality validation across modes and edge cases."""
import os
import json
import re

import httpx

BASE_URL = "https://www.consultx.app"
CHAT_URL = "https://hrnltxmwoaphgejckutk.supabase.co/functions/v1/fire-safety-chat"
EMAIL = "njajrehwaseem+consultxrelease1@gmail.com"
PASSWORD = os.environ["CONSULTX_TEST_PASSWORD"]


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
    print("JWT obtained\n")

    cases = [
        # Main
        ("primary", "en", "What is ConsultX?", None),
        ("primary", "ar", "مرحبا", None),
        ("primary", "ar", "ما رأيك في الطقس اليوم؟", None),
        # Advisory
        ("standard", "ar", "ما هي متطلبات نظام الإنذار في SBC 801؟", ["SBC-801"]),
        ("standard", "ar", "ما هو الحد الأدنى لعدد طفايات الحريق في المكاتب؟", ["SBC-801"]),
        ("standard", "ar", "هل يجب تركيب رشاشات في كل غرفة نوم؟", ["SBC-201"]),
        # Analytical
        ("analysis", "ar", "قارن بين SBC 201 و SBC 801 من حيث نظام الإنذار", ["SBC-201", "SBC-801"]),
        ("analysis", "en", "What compliance gaps exist between SBC 201 and SBC 801 for smoke detectors?", ["SBC-201", "SBC-801"]),
    ]

    results = []
    for mode, lang, q, standards in cases:
        print(f"[{mode}] {q}")
        try:
            res = chat(token, mode, q, lang, standards)
            results.append(res)
            print(f"  length={len(res['answer'])} sources={res['sources_header']} meta={len(res['source_meta'])}")
            # quick checks
            ans_lower = res["answer"].lower()
            if "sbc" in q.lower() and not res["sources_header"] and mode != "primary":
                print("  [WARN] Advisory/Analytical answer with no sources")
            if "citation" not in ans_lower and "مرجع" not in ans_lower and mode == "analysis":
                print("  [INFO] No explicit citation markers in text")
        except Exception as e:
            print(f"  ERROR: {e}")
            results.append({"mode": mode, "error": str(e)})

    with open(".verdent/testing/e2e/p2_chat_qa.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("\nSaved to .verdent/testing/e2e/p2_chat_qa.json")
