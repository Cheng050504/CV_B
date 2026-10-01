"""HTTP routes.

The CV itself is drawn in the browser (static/cv/engine.js), so the PDF is
printed client-side and matches the preview exactly. The server only builds
the Word export from the same CV data and proxies the optional AI helpers.
Nothing is stored on the server between requests.
"""

from __future__ import annotations

import io
import logging
from flask import Blueprint, render_template, request, jsonify, session, abort, send_file

from .templates_registry import CATEGORIES, FONTS, featured_templates, get_template, list_templates
from .services.docx_builder import build_docx
from .services import llm


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
# LLM endpoints
# ---------------------------------------------------------------------------

@bp.route("/api/llm/status")
def llm_status():
    return jsonify({"enabled": llm.is_enabled()})


@bp.route("/api/llm/rewrite-bullet", methods=["POST"])
def api_rewrite_bullet():
    _validate_csrf()
    if not llm.is_enabled():
        return jsonify({"error": "AI is disabled — set LLM_API_KEY to enable."}), 503

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    role = (data.get("role") or "").strip() or None
    mode = (data.get("mode") or "improve").strip()
    if mode not in llm.REWRITE_MODES:
        return jsonify({"error": "Unknown mode"}), 400
    if not text:
        return jsonify({"error": "Empty input"}), 400
    if len(text) > 4000:
        return jsonify({"error": "Input too long (max 4000 chars)"}), 400
    try:
        out = llm.rewrite_bullet(text, role_context=role, mode=mode)
    except llm.LLMError as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"result": out})


@bp.route("/api/llm/draft-cover-letter", methods=["POST"])
def api_draft_cover_letter():
    _validate_csrf()
    if not llm.is_enabled():
        return jsonify({"error": "AI is disabled — set LLM_API_KEY to enable."}), 503

    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid payload"}), 400
    try:
        out = llm.draft_cover_letter(data)
    except llm.LLMError as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"result": out})


@bp.route("/api/llm/write-summary", methods=["POST"])
def api_write_summary():
    _validate_csrf()
    if not llm.is_enabled():
        return jsonify({"error": "AI is disabled — set LLM_API_KEY to enable."}), 503

    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid payload"}), 400
    fields = [str(data.get(k) or "").strip() for k in ("headline", "experience", "skills")]
    if not any(fields):
        return jsonify({"error": "Add a headline or some experience first, then try again."}), 400
    try:
        out = llm.write_summary(*fields)
    except llm.LLMError as e:
        return jsonify({"error": str(e)}), 502
    return jsonify({"result": out})
