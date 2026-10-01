import re

import pytest

from app import app


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_home_lists_every_template_with_build_link(client):
    html = client.get("/").get_data(as_text=True)
    for tpl_id in ("finance", "tech", "generic"):
        assert f'href="/build?template={tpl_id}"' in html
        assert f"img/templates/{tpl_id}.png" in html
    assert 'id="cvForm"' not in html


@pytest.mark.parametrize("tpl_id", ["finance", "tech", "generic"])
def test_build_preselects_requested_template(client, tpl_id):
    html = client.get(f"/build?template={tpl_id}").get_data(as_text=True)
    checked = re.search(r'value="(\w+)"\s+form="cvForm"\s+checked', html)
    assert checked and checked.group(1) == tpl_id
    assert f'const requested = "{tpl_id}";' in html


def test_build_ignores_unknown_template(client):
    html = client.get("/build?template=nope").get_data(as_text=True)
    assert 'id="cvForm"' in html
    assert "const requested = null;" in html


def test_generate_still_works(client):
    html = client.get("/build").get_data(as_text=True)
    token = re.search(r'name="csrf_token" value="([^"]+)"', html).group(1)
    r = client.post("/generate", data={
        "csrf_token": token, "template_id": "tech",
        "first_name": "Alex", "last_name": "Chen", "email": "a@b.co",
    })
    assert r.status_code == 200
    assert "Your documents are ready" in r.get_data(as_text=True)


def test_rewrite_rejects_unknown_mode(client, monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test")
    html = client.get("/build").get_data(as_text=True)
    token = re.search(r'name="csrf_token" value="([^"]+)"', html).group(1)
    r = client.post("/api/llm/rewrite-bullet", json={"csrf_token": token, "text": "Did things", "mode": "shout"})
    assert r.status_code == 400


def test_ai_chips_only_shown_when_enabled(client, monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    assert "Help me write this" not in client.get("/build").get_data(as_text=True)
    monkeypatch.setenv("LLM_API_KEY", "test")
    assert "Help me write this" in client.get("/build").get_data(as_text=True)
