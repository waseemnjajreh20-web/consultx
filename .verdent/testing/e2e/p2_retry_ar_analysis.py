import os
import json
import re
import httpx

BASE_URL = "https://www.consultx.app"
SUPABASE_URL = "https://hrnltxmwoaphgejckutk.supabase.co"
CHAT_URL = f"{SUPABASE_URL}/functions/v1/fire-safety-chat"
EMAIL = "njajrehwaseem+consultxrelease1@gmail.com"
PASSWORD = os.environ["CONSULTX_TEST_PASSWORD"]

js = httpx.get(f"{BASE_URL}/assets/index-CkDqZeyh.js", timeout=60).text
anon = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", js).group(0)
r = httpx.post(
    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": anon, "Content-Type": "application/json"},
    json={"email": EMAIL, "password": PASSWORD},
    timeout=30,
)
r.raise_for_status()
token = r.json()["access_token"]

body = {
    "messages": [{"role": "user", "content": "قارن بين SBC 201 و SBC 801 من حيث نظام الإنذار"}],
    "retry": False,
    "mode": "analysis",
    "language": "ar",
    "preferred_standards": ["SBC-201", "SBC-801"],
}
with httpx.stream(
    "POST", CHAT_URL,
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}", "apikey": anon},
    json=body, timeout=180,
) as resp:
    print("status", resp.status_code)
    if not resp.is_success:
        print(resp.read().decode()[:500])
    else:
        content = ""
        for line in resp.iter_lines():
            if line.startswith("data: "):
                p = line[6:].strip()
                if p == "[DONE]":
                    break
                try:
                    d = json.loads(p)
                    delta = d.get("choices", [{}])[0].get("delta", {}).get("content")
                    if delta:
                        content += delta
                except Exception:
                    pass
        print("len", len(content))
        print(content[:500])
