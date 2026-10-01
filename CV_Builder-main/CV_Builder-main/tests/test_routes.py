import io
import re

import pytest
from docx import Document

from app import app
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
    assert len(tpls) >= 10
    assert len({t.category for t in tpls}) >= 5


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
    assert "llmEnabled: false" in client.get("/build").get_data(as_text=True)
    monkeypatch.setenv("LLM_API_KEY", "test")
    assert "llmEnabled: true" in client.get("/build").get_data(as_text=True)
