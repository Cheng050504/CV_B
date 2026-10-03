import json

import pytest

from app import app
from resume_builder.services import llm
from tests.test_routes import _byok


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_translate_keeps_long_cover_letter_whole(client, monkeypatch):
    body = ("I am applying for the analyst role at your firm. " * 60).strip()  # ~3000 chars
    seen = {}

    def fake_chat(cfg, system, user, **kw):
        seen["sent"] = json.loads(user)
        return json.dumps({k: v + " (es)" for k, v in seen["sent"].items()})

    monkeypatch.setattr(llm, "_chat", fake_chat)
    r = client.post("/api/llm/translate", json={"strings": {"l.body": body}, "language": "Spanish"}, headers=_byok(client))
    assert r.status_code == 200
    assert seen["sent"]["l.body"] == body
    assert r.get_json()["result"]["l.body"] == body + " (es)"


def test_translate_still_rejects_oversized_cv(client, monkeypatch):
    monkeypatch.setattr(llm, "_chat", lambda *a, **k: pytest.fail("should not call the model"))
    strings = {f"x{i}": "word " * 1000 for i in range(5)}  # ~25000 chars in total
    r = client.post("/api/llm/translate", json={"strings": strings, "language": "Spanish"}, headers=_byok(client))
    assert r.status_code == 502 and "too long" in r.get_json()["error"]
