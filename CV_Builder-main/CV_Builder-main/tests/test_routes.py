import io
import re

import pytest
from docx import Document

from app import app
from resume_builder.services import llm
from resume_builder.templates_registry import list_templates


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    return app.test_client()


def _token(client):
    html = client.get("/build").get_data(as_text=True)
    return re.search(r'id="csrfToken" value="([^"]+)"', html).group(1)


def _cv(**personal):
    return {
        "style": {"template": "clean", "accent": "#2F5D8A", "font": "inter", "size": "m", "page": "A4"},
        "personal": {"firstName": "Alex", "lastName": "Chen", "email": "a@b.co", **personal},
        "sections": [
            {"type": "summary", "title": "Profile", "items": [{"text": "Analyst who likes numbers."}]},
            {"type": "experience", "title": "Experience", "items": [
                {"role": "Analyst", "org": "Acme", "start": "2023", "end": "Present", "description": "Built models\nCut costs 10%"},
            ]},
            {"type": "skills", "title": "Skills", "items": [{"name": "Excel", "level": "Expert"}, {"name": "Python"}]},
            {"type": "interests", "title": "Hidden bit", "hidden": True, "items": [{"name": "Chess"}]},
        ],
        "letter": {"company": "Acme", "role": "Analyst", "body": "First para.\n\nSecond para."},
    }


def test_has_many_templates_across_categories():
    tpls = list_templates()
    assert len(tpls) >= 20
    assert len({t.category for t in tpls}) >= 5


def test_favicon(client):
    r = client.get("/favicon.ico")
    assert r.status_code == 200 and r.mimetype == "image/png"
    html = client.get("/").get_data(as_text=True)
    assert "img/favicon.svg" in html and "apple-touch-icon" in html


def test_template_ids_unique_and_styled():
    import pathlib
    css = (pathlib.Path(__file__).resolve().parents[1] / "static/cv/cv.css").read_text()
    ids = [t.id for t in list_templates()]
    assert len(ids) == len(set(ids)) >= 45
    missing = [i for i in ids if f".cv--{i}" not in css]
    assert not missing, missing


def test_original_formats_are_back():
    by_id = {t.id: t for t in list_templates()}
    for tid in ("finance", "generic", "techline"):
        t = by_id[tid]
        assert t.category == "Original" and t.org_first and t.lines


def test_docx_export_in_times_for_finance(client):
    cv = _cv()
    cv["style"].update(template="finance", font="times")
    r = client.post("/api/export/docx", json={"cv": cv, "doc": "cv"}, headers={"X-CSRF-Token": _token(client)})
    assert r.status_code == 200
    assert Document(io.BytesIO(r.data)).styles["Normal"].font.name == "Times New Roman"


def test_home_shows_featured_live_previews(client):
    html = client.get("/").get_data(as_text=True)
    assert 'class="cv-mini"' in html
    assert 'href="/templates"' in html
    assert "window.CV_META" in html


def test_gallery_lists_every_template(client):
    html = client.get("/templates").get_data(as_text=True)
    for t in list_templates():
        assert f'href="/build?template={t.id}"' in html


def test_build_passes_requested_template(client):
    html = client.get("/build?template=creative").get_data(as_text=True)
    assert 'requestedTemplate: "creative"' in html
    assert 'id="paper"' in html


def test_build_ignores_unknown_template(client):
    html = client.get("/build?template=nope").get_data(as_text=True)
    assert "requestedTemplate: null" in html


def test_docx_export(client):
    r = client.post("/api/export/docx", json={"cv": _cv(), "doc": "cv"}, headers={"X-CSRF-Token": _token(client)})
    assert r.status_code == 200
    assert "Alex_Chen_CV.docx" in r.headers["Content-Disposition"]
    text = "\n".join(p.text for p in Document(io.BytesIO(r.data)).paragraphs)
    assert "Alex Chen" in text and "Cut costs 10%" in text and "Excel (Expert), Python" in text
    assert "Chess" not in text


def test_docx_cover_letter(client):
    r = client.post("/api/export/docx", json={"cv": _cv(), "doc": "letter"}, headers={"X-CSRF-Token": _token(client)})
    assert r.status_code == 200
    assert "Alex_Chen_Cover_Letter.docx" in r.headers["Content-Disposition"]
    text = "\n".join(p.text for p in Document(io.BytesIO(r.data)).paragraphs)
    assert "Second para." in text and "Re: Analyst" in text


def test_docx_export_survives_odd_input(client):
    cv = {"style": {"accent": "javascript:alert(1)", "font": "nope", "page": "Huge"}, "personal": {"firstName": "../../x"},
          "sections": [None, {"type": "experience", "items": ["bad", {"role": 5}]}]}
    r = client.post("/api/export/docx", json={"cv": cv}, headers={"X-CSRF-Token": _token(client)})
    assert r.status_code == 200
    assert "/" not in r.headers["Content-Disposition"].split("filename=")[1]


def test_docx_export_needs_csrf(client):
    client.get("/build")
    r = client.post("/api/export/docx", json={"cv": _cv()})
    assert r.status_code in (400, 403)


def test_docx_export_rejects_bad_payload(client):
    r = client.post("/api/export/docx", json={"cv": "nope"}, headers={"X-CSRF-Token": _token(client)})
    assert r.status_code == 400


def test_rewrite_rejects_unknown_mode(client, monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test")
    r = client.post("/api/llm/rewrite-bullet", json={"text": "Did things", "mode": "shout"}, headers={"X-CSRF-Token": _token(client)})
    assert r.status_code == 400


def test_write_summary_needs_some_input(client, monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test")
    r = client.post("/api/llm/write-summary", json={}, headers={"X-CSRF-Token": _token(client)})
    assert r.status_code == 400


def test_ai_flag_follows_api_key(client, monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    html = client.get("/build").get_data(as_text=True)
    assert "serverAi: false" in html and '"id": "anthropic"' in html
    monkeypatch.setenv("LLM_API_KEY", "test")
    assert "serverAi: true" in client.get("/build").get_data(as_text=True)


def _byok(client, provider="anthropic", key="sk-ant-test-key-123", model=""):
    return {"X-CSRF-Token": _token(client), "X-AI-Provider": provider, "X-AI-Key": key, "X-AI-Model": model}


def test_ai_without_any_key_asks_for_one(client, monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    r = client.post("/api/llm/write-bullets", json={"role": "Analyst"}, headers={"X-CSRF-Token": _token(client)})
    assert r.status_code == 401 and r.get_json()["needsKey"] is True


def test_ai_uses_the_visitors_own_key(client, monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    seen = {}

    def fake_chat(cfg, system, user, **kw):
        seen["cfg"], seen["user"] = cfg, user
        return "Built models\nCut costs"

    monkeypatch.setattr(llm, "_chat", fake_chat)
    r = client.post("/api/llm/write-bullets", json={"role": "Analyst", "notes": "models", "job": "Bank analyst role"},
                    headers=_byok(client))
    assert r.status_code == 200 and r.get_json()["result"].startswith("Built")
    assert seen["cfg"].kind == "anthropic" and seen["cfg"].api_key == "sk-ant-test-key-123"
    assert seen["cfg"].model == "claude-opus-5-5"
    assert "Bank analyst role" in seen["user"]


def test_ai_model_override_and_openai_provider(client, monkeypatch):
    seen = {}
    monkeypatch.setattr(llm, "_chat", lambda cfg, *a, **k: seen.setdefault("cfg", cfg) and "ok")
    r = client.post("/api/llm/test", json={}, headers=_byok(client, "openrouter", "sk-or-abcdefgh", "meta/llama-3"))
    assert r.status_code == 200
    assert seen["cfg"].base_url == "https://openrouter.ai/api/v1" and seen["cfg"].model == "meta/llama-3"


@pytest.mark.parametrize("provider,key,model", [("evil", "sk-abcdefgh", ""), ("openai", "short", ""), ("openai", "sk-abcdefgh", "bad model!")])
def test_ai_rejects_bad_settings(client, provider, key, model):
    r = client.post("/api/llm/test", json={}, headers=_byok(client, provider, key, model))
    assert r.status_code == 400


def test_suggest_skills_skips_ones_already_listed(client, monkeypatch):
    monkeypatch.setattr(llm, "_chat", lambda *a, **k: "1. Excel, Python\n- Financial modelling, Bloomberg")
    r = client.post("/api/llm/suggest-skills", json={"headline": "Analyst", "have": "Excel, python"}, headers=_byok(client))
    assert r.get_json()["result"] == ["Financial modelling", "Bloomberg"]


def test_ai_errors_are_friendly(client, monkeypatch):
    def boom(*a, **k):
        raise llm.LLMError("Claude rejected that API key. Check it in AI settings.")
    monkeypatch.setattr(llm, "_chat", boom)
    r = client.post("/api/llm/test", json={}, headers=_byok(client))
    assert r.status_code == 502 and "rejected" in r.get_json()["error"]
