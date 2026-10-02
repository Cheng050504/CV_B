"""Application factory for the Resume Builder Flask app."""

from __future__ import annotations

import os
import secrets
from datetime import date
from flask import Flask, session


def _csrf_token() -> str:
    """Return (and lazily create) a per-session CSRF token."""
    if "_csrf" not in session:
        session["_csrf"] = secrets.token_hex(32)
    return session["_csrf"]


def create_app() -> Flask:
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    templates_dir = os.path.join(base_dir, "templates")
    static_dir = os.path.join(base_dir, "static")

    on_vercel = bool(os.environ.get("VERCEL") or os.environ.get("VERCEL_ENV"))
    instance_dir = "/tmp/pathbuddy_instance" if on_vercel else os.path.join(base_dir, "instance")
    os.makedirs(instance_dir, exist_ok=True)

    app = Flask(
        __name__,
        template_folder=templates_dir,
        static_folder=static_dir,
        instance_path=instance_dir,
        instance_relative_config=True,
    )
    app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key")
    app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024  # 4MB cap (CV uploads; Vercel allows 4.5MB)

    from .routes import bp as main_bp
    app.register_blueprint(main_bp)

    app.jinja_env.globals["csrf_token"] = _csrf_token
    app.jinja_env.globals["current_year"] = date.today().year

    return app
