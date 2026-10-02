"""Minimal OpenAI-compatible chat client.

Works against anything that speaks the OpenAI chat/completions API:
OpenAI, OpenRouter, Ollama (``/v1``), LM Studio, vLLM, groq, etc.

Configuration is environment-variable driven so the same code deploys
locally and on serverless with zero changes:

- ``LLM_API_KEY``   required to enable AI endpoints
- ``LLM_BASE_URL``  default ``https://api.openai.com/v1``
- ``LLM_MODEL``     default ``gpt-4o-mini``

If ``LLM_API_KEY`` is not set the public helpers raise ``LLMDisabled`` so
the UI can show a friendly "configure your key" message instead of an
opaque 500.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import List, Dict, Optional


class LLMDisabled(RuntimeError):
    """Raised when no LLM_API_KEY is configured."""


class LLMError(RuntimeError):
    """Raised when the upstream call fails."""


def is_enabled() -> bool:
    return bool(os.environ.get("LLM_API_KEY", "").strip())


def _config() -> Dict[str, str]:
    api_key = os.environ.get("LLM_API_KEY", "").strip()
    if not api_key:
        raise LLMDisabled("LLM_API_KEY is not configured.")
    return {
        "api_key": api_key,
        "base_url": os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
        "model": os.environ.get("LLM_MODEL", "gpt-4o-mini"),
    }


def _chat(messages: List[Dict[str, str]], *, temperature: float = 0.4, max_tokens: int = 600) -> str:
    cfg = _config()
    url = f"{cfg['base_url']}/chat/completions"
    payload = json.dumps({
        "model": cfg["model"],
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['api_key']}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise LLMError(f"LLM HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')[:200]}") from e
    except Exception as e:
        raise LLMError(f"LLM request failed: {e}") from e

    try:
        data = json.loads(body)
        return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        raise LLMError(f"Malformed LLM response: {e}") from e


# ---------------------------------------------------------------------------
# Public helpers used by the routes
# ---------------------------------------------------------------------------

REWRITE_MODES = ("improve", "concise")


def rewrite_bullet(text: str, role_context: Optional[str] = None, mode: str = "improve") -> str:
    """Rewrite an experience description.

    ``mode="improve"`` makes it more impactful; ``mode="concise"`` shortens it
    without dropping facts.
    """
    if not text or not text.strip():
        raise LLMError("Empty input.")
    if mode not in REWRITE_MODES:
        raise LLMError(f"Unknown rewrite mode: {mode}")

    if mode == "concise":
        system = (
            "You are an elite resume editor. Make the work-experience text below "
            "more concise: cut filler words and merge repetition, but keep every "
            "fact, number and line break. Return ONLY the rewritten text — no "
            "preamble, no bullets prefix, no quotes."
        )
    else:
        system = (
            "You are an elite resume editor. You rewrite work-experience bullet points "
            "to be concise, quantified, and action-led. Use strong verbs, include "
            "numbers where implied, and preserve factual meaning. Return ONLY the "
            "rewritten text — no preamble, no bullets prefix, no quotes."
        )
    user = text.strip()
    if role_context:
        user = f"Role context: {role_context.strip()}\n\nOriginal:\n{text.strip()}"

    return _chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.3,
        max_tokens=400,
    )


def draft_cover_letter(context: Dict[str, str]) -> str:
    """Draft the body (3 short paragraphs) of a cover letter from form context."""
    system = (
        "You are a career coach drafting cover letters for early-career candidates. "
        "Output exactly three short paragraphs (intro, fit, close), around 80-120 "
        "words total, warm but professional, no clichés, no emojis, no placeholders. "
        "Do not include the salutation, sign-off, address, or date — those are added "
        "by the template."
    )
    relevant_keys = [
        "position_name", "company_name", "referral_source", "firm_impression",
        "past_experience", "experience_theme", "gained_skills", "project",
        "project_result", "background_summary", "skill_summary",
    ]
    ctx_lines = [f"- {k}: {context.get(k, '').strip()}" for k in relevant_keys if context.get(k, "").strip()]
    if not ctx_lines:
        raise LLMError("Please fill in at least a few fields on this step first.")

    user = "Candidate context:\n" + "\n".join(ctx_lines)
    return _chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.55,
        max_tokens=500,
    )
