"""HTTP routes.

Key design: generated documents are returned to the browser as base64
`data:` URIs embedded in the response HTML. Nothing is kept on the server
between requests, so the app works correctly on serverless runtimes where
``/tmp`` does **not** persist across invocations.
"""

from __future__ import annotations

import base64
import logging
from flask import Blueprint, render_template, request, jsonify, flash, session, abort

from .templates_registry import list_templates, get_template, DEFAULT_TEMPLATE_ID
from .services.docx_renderer import build_documents
from .services.pdf_converter import docx_bytes_to_pdf_bytes
from .services import llm


log = logging.getLogger(__name__)
bp = Blueprint("main", __name__)


def _validate_csrf() -> None:
    """Abort 403 if the submitted csrf_token doesn't match the session token."""
    token = request.form.get("csrf_token", "") or (request.get_json(silent=True) or {}).get("csrf_token", "")
    expected = session.get("_csrf", "")
    if not token or not expected or token != expected:
        abort(403)

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _build(form):
    tpl = get_template(form.get("template_id") or DEFAULT_TEMPLATE_ID)
    result = build_documents(form, tpl.cv_path(), tpl.cl_path())

    cv_pdf = docx_bytes_to_pdf_bytes(result["cv_docx_bytes"], basename=result["cv_filename_base"])
    cl_pdf = docx_bytes_to_pdf_bytes(result["cl_docx_bytes"], basename=result["cl_filename_base"])

    return {
        "template": tpl,
        "cv_filename_base": result["cv_filename_base"],
        "cl_filename_base": result["cl_filename_base"],
        "cv_docx_b64": _b64(result["cv_docx_bytes"]),
        "cl_docx_b64": _b64(result["cl_docx_bytes"]),
        "cv_pdf_b64": _b64(cv_pdf) if cv_pdf else None,
        "cl_pdf_b64": _b64(cl_pdf) if cl_pdf else None,
        "pdf_ok": bool(cv_pdf and cl_pdf),
    }


@bp.route("/")
def index():
    return render_template(
        "form.html",
        templates=list_templates(),
        default_template_id=DEFAULT_TEMPLATE_ID,
        llm_enabled=llm.is_enabled(),
    )


@bp.route("/generate", methods=["POST"])
def generate():
    _validate_csrf()
    try:
        ctx = _build(request.form)
    except FileNotFoundError as e:
        log.exception("Template file missing")
        flash(f"Template file is missing on the server: {e}", "error")
        return render_template(
            "form.html",
            templates=list_templates(),
            default_template_id=DEFAULT_TEMPLATE_ID,
            llm_enabled=llm.is_enabled(),
        ), 500

    if not ctx["pdf_ok"]:
        flash("PDF export is not available in this environment — your DOCX files are ready to download.", "warning")

    return render_template("success.html", **ctx)


@bp.route("/preview", methods=["POST"])
def preview():
    _validate_csrf()
    try:
        ctx = _build(request.form)
    except FileNotFoundError as e:
        log.exception("Template file missing")
        return f"Template file missing: {e}", 500
    return render_template("preview.html", **ctx)


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
    if not text:
        return jsonify({"error": "Empty input"}), 400
    if len(text) > 4000:
        return jsonify({"error": "Input too long (max 4000 chars)"}), 400
    try:
        out = llm.rewrite_bullet(text, role_context=role)
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
