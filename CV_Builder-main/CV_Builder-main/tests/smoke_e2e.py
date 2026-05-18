"""Manual end-to-end smoke test. Not part of pytest."""
import re
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

c = app.test_client()

form = {
    "first_name": "Alex", "last_name": "Chen", "email": "a@b.co",
    "ed_school[]": "Columbia", "ed_field[]": "Econ",
    "e_company[]": "MS", "e_title[]": "Analyst", "e_summary[]": "Built models",
    "template_id": "finance",
}

r = c.post("/generate", data=form)
assert r.status_code == 200, r.status_code
html = r.data.decode("utf-8")

uris = re.findall(r"data:[^;]+;base64,[A-Za-z0-9+/=]{40}", html)
dl = re.findall(r'download="[^"]+\.docx"', html)

print("status        =", r.status_code)
print("response size =", len(html), "bytes")
print("data: URIs    =", len(uris))
print("download=     =", len(dl), "→", dl[:2])
print("template name shown =", "Finance" in html)

# Make sure no /download/ link remains (old pattern that 404'd on serverless).
assert "/download/" not in html, "legacy /download/ URL leaked into response"
print("legacy /download/ URL present =", "/download/" in html)
print("OK")
