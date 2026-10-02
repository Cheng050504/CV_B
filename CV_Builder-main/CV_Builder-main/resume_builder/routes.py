"""HTTP routes.

The CV itself is drawn in the browser (static/cv/engine.js), so the PDF is
printed client-side and matches the preview exactly. The server only builds
the Word export from the same CV data and proxies the optional AI helpers.
Nothing is stored on the server between requests.
"""

from __future__ import annotations

import io
import os
import logging
from flask import Blueprint, current_app, render_template, request, jsonify, session, abort, send_file, send_from_directory

from .templates_registry import CATEGORIES, FONTS, featured_templates, get_template, list_templates
from .services.docx_builder import build_docx
from .services import llm
from .services import cv_import


log = logging.getLogger(__name__)
bp = Blueprint("main", __name__)


def _validate_csrf() -> None:
    """Abort 403 if the submitted csrf_token doesn't match the session token."""
    token = (request.headers.get("X-CSRF-Token", "")
             or request.form.get("csrf_token", "")
             or (request.get_json(silent=True) or {}).get("csrf_token", ""))
    expected = session.get("_csrf", "")
    if not token or not expected or token != expected:
        abort(403)

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _cv_meta():
    """Template + font metadata the browser engine needs, as plain dicts."""
    return {
        "templates": {t.id: t.to_dict() for t in list_templates()},
        "fonts": FONTS,
        "categories": CATEGORIES,
        # tojson sorts dict keys, so keep the curated order separately.
        "order": [t.id for t in list_templates()],
        "fontOrder": list(FONTS),
    }


@bp.route("/")
def index():
    return render_template(
        "home.html",
        templates=featured_templates(),
        template_count=len(list_templates()),
        cv_meta=_cv_meta(),
        llm_enabled=llm.is_enabled(),
    )


@bp.route("/favicon.ico")
def favicon():
    """Browsers ask for /favicon.ico before reading the page's icon links."""
    return send_from_directory(os.path.join(current_app.static_folder, "img"), "favicon-32.png",
                               mimetype="image/png", max_age=86400)


@bp.route("/templates")
def gallery():
    return render_template(
        "gallery.html",
        templates=list_templates(),
        categories=CATEGORIES,
        cv_meta=_cv_meta(),
        title="CV templates | CV Builders",
    )


@bp.route("/build")
def build():
    requested = request.args.get("template")
    tpl = get_template(requested)
    return render_template(
        "editor.html",
        templates=list_templates(),
        cv_meta=_cv_meta(),
        requested_template_id=tpl.id if requested == tpl.id else None,
        llm_enabled=llm.is_enabled(),
        ai_providers=llm.public_providers(),
        title="Editor | CV Builders",
    )


@bp.route("/api/export/docx", methods=["POST"])
def export_docx():
    _validate_csrf()
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("cv"), dict):
        return jsonify({"error": "Invalid payload"}), 400
    doc_kind = data.get("doc", "cv")
    if doc_kind not in ("cv", "letter"):
        return jsonify({"error": "Unknown document"}), 400
    try:
        payload, filename = build_docx(data["cv"], doc_kind)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    return send_file(
        io.BytesIO(payload),
        mimetype=DOCX_MIME,
        as_attachment=True,
        download_name=filename,
    )


@bp.route("/health")
def health():
    return {"status": "ok", "llm_enabled": llm.is_enabled()}


# ---------------------------------------------------------------------------
# AI endpoints. The visitor's own key arrives in headers and is used for this
# one call only; it is never stored or logged.
# ---------------------------------------------------------------------------

def _ai_config() -> llm.Config:
    key = request.headers.get("X-AI-Key", "")
    if key:
        return llm.user_config(request.headers.get("X-AI-Provider", ""), key, request.headers.get("X-AI-Model"))
    return llm.env_config()


def _ai_call(fn):
    """Run one AI helper with CSRF, key resolution and friendly errors."""
    _validate_csrf()
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid payload"}), 400
    try:
        cfg = _ai_config()
    except llm.LLMDisabled:
        return jsonify({"error": "Add your AI key in AI assistant settings first.", "needsKey": True}), 401
    except ValueError as e:
        return jsonify({"error": str(e), "needsKey": True}), 400
    try:
        return jsonify({"result": fn(cfg, data)})
    except llm.LLMError as e:
        log.info("AI call failed: %s", type(e.__cause__).__name__ if e.__cause__ else "LLMError")
        return jsonify({"error": str(e)}), 502


def _job(data) -> str:
    return str(data.get("job") or "")


@bp.route("/api/llm/status")
def llm_status():
    return jsonify({"enabled": llm.is_enabled(), "providers": llm.public_providers()})


@bp.route("/api/llm/test", methods=["POST"])
def api_test_key():
    return _ai_call(lambda cfg, data: llm.check_key(cfg))


@bp.route("/api/llm/rewrite-bullet", methods=["POST"])
def api_rewrite_bullet():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text") or "").strip() if isinstance(data, dict) else ""
    mode = str(data.get("mode") or "improve").strip() if isinstance(data, dict) else ""
    if mode not in llm.REWRITE_MODES:
        _validate_csrf()
        return jsonify({"error": "Unknown mode"}), 400
    if not text or len(text) > 4000:
        _validate_csrf()
        return jsonify({"error": "Write something first (up to 4000 characters)."}), 400
    return _ai_call(lambda cfg, d: llm.rewrite_bullet(
        cfg, text, role_context=str(d.get("role") or "").strip() or None, mode=mode, job=_job(d)))


@bp.route("/api/llm/write-bullets", methods=["POST"])
def api_write_bullets():
    return _ai_call(lambda cfg, d: llm.write_bullets(cfg, d.get("role"), d.get("org"), d.get("notes"), _job(d)))


@bp.route("/api/llm/write-summary", methods=["POST"])
def api_write_summary():
    data = request.get_json(silent=True) or {}
    if isinstance(data, dict) and not any(str(data.get(k) or "").strip() for k in ("headline", "experience", "skills")):
        _validate_csrf()
        return jsonify({"error": "Add a headline or some experience first, then try again."}), 400
    return _ai_call(lambda cfg, d: llm.write_summary(cfg, d.get("headline"), d.get("experience"), d.get("skills"), _job(d)))


@bp.route("/api/llm/suggest-skills", methods=["POST"])
def api_suggest_skills():
    return _ai_call(lambda cfg, d: llm.suggest_skills(cfg, d.get("headline"), d.get("experience"), d.get("have"), _job(d)))


@bp.route("/api/llm/draft-cover-letter", methods=["POST"])
def api_draft_cover_letter():
    return _ai_call(lambda cfg, d: llm.draft_cover_letter(cfg, d))


@bp.route("/api/llm/translate", methods=["POST"])
def api_translate():
    data = request.get_json(silent=True) or {}
    strings = data.get("strings") if isinstance(data, dict) else None
    language = str(data.get("language") or "").strip() if isinstance(data, dict) else ""
    if not isinstance(strings, dict) or not strings or not language:
        _validate_csrf()
        return jsonify({"error": "Choose a language and add some content first."}), 400
    return _ai_call(lambda cfg, d: llm.translate_strings(cfg, strings, language))


@bp.route("/api/import", methods=["POST"])
def api_import():
    """Read an uploaded CV and return it in the editor's shape.

    Uses the visitor's AI key (or the site key) when there is one, because it
    reads messy layouts far better; otherwise falls back to pattern matching.
    The file is processed in memory and never stored.
    """
    _validate_csrf()
    upload = request.files.get("file")
    if not upload or not upload.filename:
        return jsonify({"error": "Choose a file to import."}), 400
    data = upload.read(4 * 1024 * 1024 + 1)
    if len(data) > 4 * 1024 * 1024:
        return jsonify({"error": "That file is over 4 MB. Try a smaller PDF or the Word version."}), 400
    try:
        text = cv_import.extract_text(upload.filename, data)
    except cv_import.ImportError_ as e:
        return jsonify({"error": str(e)}), 400

    note = ""
    try:
        cfg = _ai_config()
    except (llm.LLMDisabled, ValueError):
        cfg = None
    if cfg is not None:
        try:
            parsed = cv_import.normalize(llm.parse_cv(cfg, text))
            if parsed["sections"] or any(parsed["personal"].values()):
                return jsonify({"cv": parsed, "usedAi": True})
        except (llm.LLMError, cv_import.ImportError_) as e:
            note = f"AI couldn't read it ({e}), so we used the basic reader."
    parsed = cv_import.normalize(cv_import.heuristic_parse(text))
    return jsonify({"cv": parsed, "usedAi": False, "note": note})
