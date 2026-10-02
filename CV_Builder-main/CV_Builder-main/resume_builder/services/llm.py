"""AI writing helpers.

Two ways to get a key:

1. **The visitor's own key** ("bring your own key"). The editor sends it on
   each request in the ``X-AI-Key`` header together with ``X-AI-Provider``
   and an optional ``X-AI-Model``. It is used for that one call and never
   stored or logged on the server.
2. **A site-wide key** from the environment, if the owner sets one:
   ``LLM_API_KEY`` (+ optional ``LLM_PROVIDER``, ``LLM_BASE_URL``, ``LLM_MODEL``).

Providers are a fixed allowlist so the server never calls an arbitrary URL.
Claude goes through the official ``anthropic`` SDK; the others speak the
OpenAI-compatible chat/completions API.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Dict, List, Optional

import anthropic


class LLMDisabled(RuntimeError):
    """Raised when no key is available for this request."""


class LLMError(RuntimeError):
    """Raised when the upstream call fails. Messages are safe to show users."""


PROVIDERS: Dict[str, Dict[str, str]] = {
    "anthropic": {
        "label": "Claude (Anthropic)",
        "kind": "anthropic",
        "model": "claude-opus-5-5",
        "key_hint": "sk-ant-…",
        "key_url": "https://console.anthropic.com/settings/keys",
    },
    "openai": {
        "label": "OpenAI",
        "kind": "openai",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "key_hint": "sk-…",
        "key_url": "https://platform.openai.com/api-keys",
    },
    "gemini": {
        "label": "Google Gemini",
        "kind": "openai",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "model": "gemini-2.5-flash",
        "key_hint": "AIza…",
        "key_url": "https://aistudio.google.com/apikey",
    },
    "openrouter": {
        "label": "OpenRouter",
        "kind": "openai",
        "base_url": "https://openrouter.ai/api/v1",
        "model": "openai/gpt-4o-mini",
        "key_hint": "sk-or-…",
        "key_url": "https://openrouter.ai/keys",
    },
}

_MODEL_RE = re.compile(r"^[\w.\-:/@]{1,100}$")
_KEY_RE = re.compile(r"^[\x21-\x7e]{8,300}$")


@dataclass(frozen=True)
class Config:
    kind: str
    api_key: str
    model: str
    base_url: str = ""


def public_providers() -> List[Dict[str, str]]:
    """Provider list for the browser (no URLs it doesn't need)."""
    return [
        {"id": pid, "label": p["label"], "model": p["model"], "key_hint": p["key_hint"], "key_url": p["key_url"]}
        for pid, p in PROVIDERS.items()
    ]


def is_enabled() -> bool:
    """True when the site owner configured a shared key."""
    return bool(os.environ.get("LLM_API_KEY", "").strip())


def env_config() -> Config:
    api_key = os.environ.get("LLM_API_KEY", "").strip()
    if not api_key:
        raise LLMDisabled("No site-wide AI key is configured.")
    provider = PROVIDERS.get(os.environ.get("LLM_PROVIDER", "").strip().lower())
    if provider and provider["kind"] == "anthropic":
        return Config("anthropic", api_key, os.environ.get("LLM_MODEL") or provider["model"])
    return Config(
        "openai",
        api_key,
        os.environ.get("LLM_MODEL") or (provider or PROVIDERS["openai"])["model"],
        (os.environ.get("LLM_BASE_URL") or (provider or PROVIDERS["openai"])["base_url"]).rstrip("/"),
    )


def user_config(provider_id: str, api_key: str, model: Optional[str] = None) -> Config:
    """Build a config from the visitor's own key. Raises ValueError on bad input."""
    provider = PROVIDERS.get((provider_id or "").strip().lower())
    if not provider:
        raise ValueError("Unknown AI provider.")
    api_key = (api_key or "").strip()
    if not _KEY_RE.match(api_key):
        raise ValueError("That doesn't look like an API key.")
    model = (model or "").strip() or provider["model"]
    if not _MODEL_RE.match(model):
        raise ValueError("That model name isn't valid.")
    return Config(provider["kind"], api_key, model, provider.get("base_url", ""))


# ---------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------

def _chat_anthropic(cfg: Config, system: str, user: str) -> str:
    client = anthropic.Anthropic(api_key=cfg.api_key, timeout=60.0, max_retries=1)
    kwargs = dict(
        model=cfg.model,
        # Thinking shares this budget; low effort keeps the real spend small.
        max_tokens=16000,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_config={"effort": "low"},
    )
    try:
        if cfg.model == PROVIDERS["anthropic"]["model"]:
            # If a safety check declines, retry on another model inside the same call.
            response = client.beta.messages.create(
                betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs
            )
        else:
            response = client.messages.create(**kwargs)
    except anthropic.AuthenticationError as e:
        raise LLMError("Claude rejected that API key. Check it in AI settings.") from e
    except anthropic.PermissionDeniedError as e:
        raise LLMError("That key isn't allowed to use this model.") from e
    except anthropic.NotFoundError as e:
        raise LLMError(f"Claude doesn't know the model “{cfg.model}”.") from e
    except anthropic.RateLimitError as e:
        raise LLMError("Your Claude account hit a rate or credit limit. Try again shortly.") from e
    except anthropic.BadRequestError as e:
        raise LLMError(f"Claude couldn't run that request: {e.message[:160]}") from e
    except anthropic.APIStatusError as e:
        raise LLMError(f"Claude is having trouble right now ({e.status_code}). Try again.") from e
    except anthropic.APIConnectionError as e:
        raise LLMError("Couldn't reach Claude. Try again.") from e

    if response.stop_reason == "refusal":
        raise LLMError("The AI declined to write this. Try rephrasing your notes.")
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    if not text:
        raise LLMError("The AI returned an empty answer. Try again.")
    return text


def _chat_openai(cfg: Config, system: str, user: str, temperature: float, max_tokens: int) -> str:
    payload = json.dumps({
        "model": cfg.model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{cfg.base_url}/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {cfg.api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise LLMError("The provider rejected that API key. Check it in AI settings.") from e
        if e.code == 404:
            raise LLMError(f"The provider doesn't know the model “{cfg.model}”.") from e
        if e.code == 429:
            raise LLMError("Your AI account hit a rate or credit limit. Try again shortly.") from e
        raise LLMError(f"The AI provider returned an error ({e.code}). Try again.") from e
    except Exception as e:
        raise LLMError("Couldn't reach the AI provider. Try again.") from e

    try:
        return json.loads(body)["choices"][0]["message"]["content"].strip()
    except Exception as e:
        raise LLMError("The AI provider sent back something unexpected.") from e


def _chat(cfg: Config, system: str, user: str, *, temperature: float = 0.4, max_tokens: int = 600) -> str:
    if cfg.kind == "anthropic":
        return _chat_anthropic(cfg, system, user)
    return _chat_openai(cfg, system, user, temperature, max_tokens)


# ---------------------------------------------------------------------------
# Writing helpers
# ---------------------------------------------------------------------------

REWRITE_MODES = ("improve", "concise")

_NO_INVENT = "Never invent employers, numbers, dates or achievements that are not in the input."


def _clip(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _job_block(job: str) -> str:
    job = _clip(job, 4000)
    return f"\n\nJob advert they are applying for (tailor wording to it, don't copy it):\n{job}" if job else ""


def check_key(cfg: Config) -> str:
    """Tiny request that proves the key works."""
    return _chat(cfg, "Reply with the single word: ready", "Are you ready?", temperature=0, max_tokens=16)


def rewrite_bullet(cfg: Config, text: str, role_context: Optional[str] = None, mode: str = "improve", job: str = "") -> str:
    """Rewrite an experience description: ``improve`` or ``concise``."""
    if not text or not text.strip():
        raise LLMError("Empty input.")
    if mode not in REWRITE_MODES:
        raise LLMError(f"Unknown rewrite mode: {mode}")
    if mode == "concise":
        system = (
            "You are an expert CV editor. Make the work-experience text below more concise: "
            "cut filler words and merge repetition, but keep every fact, number and line break. "
            "Return ONLY the rewritten text, one achievement per line, no bullet symbols, no quotes."
        )
    else:
        system = (
            "You are an expert CV editor. Rewrite the work-experience text as concise, "
            "action-led achievements with strong verbs, one per line. Keep the facts. "
            f"{_NO_INVENT} Return ONLY the rewritten lines, no bullet symbols, no quotes."
        )
    user = text.strip()
    if role_context:
        user = f"Role: {role_context.strip()}\n\nOriginal:\n{text.strip()}"
    return _chat(cfg, system, user + _job_block(job), temperature=0.3, max_tokens=500)


def write_bullets(cfg: Config, role: str, org: str = "", notes: str = "", job: str = "") -> str:
    """Draft 3-4 achievement lines for a role from the user's rough notes."""
    role, org, notes = _clip(role, 200), _clip(org, 200), _clip(notes, 2000)
    if not (role or notes):
        raise LLMError("Add a job title or a few notes first, then try again.")
    system = (
        "You help people write CVs. Write 3-4 achievement lines for this role, one per line, "
        "each starting with a strong past-tense verb, 12-22 words each. Base them on the notes. "
        "Where the notes have no numbers, describe scope and outcome plainly instead of making numbers up. "
        f"{_NO_INVENT} Return ONLY the lines, no bullet symbols."
    )
    user = f"Role: {role}\nOrganisation: {org}\nTheir notes: {notes or '(none)'}"
    return _chat(cfg, system, user + _job_block(job), temperature=0.5, max_tokens=400)


def write_summary(cfg: Config, headline: str = "", experience: str = "", skills: str = "", job: str = "") -> str:
    """Draft a 2-3 sentence CV profile from what the user has already entered."""
    parts = {
        "Headline": _clip(headline, 200),
        "Experience and education": _clip(experience, 3500),
        "Skills": _clip(skills, 800),
    }
    lines = [f"{k}: {v}" for k, v in parts.items() if v]
    if not lines:
        raise LLMError("Add a headline or some experience first, then try again.")
    system = (
        "You write the short profile at the top of a CV. Write 2-3 sentences, 50-70 words, "
        "in an implied first person (no 'I' at the start), specific to the facts given, "
        f"no clichés, no emojis. {_NO_INVENT} Return ONLY the profile text."
    )
    return _chat(cfg, system, "\n".join(lines) + _job_block(job), temperature=0.5, max_tokens=300)


def suggest_skills(cfg: Config, headline: str = "", experience: str = "", have: str = "", job: str = "") -> List[str]:
    """Suggest up to 8 relevant skills the CV doesn't list yet."""
    if not (_clip(headline, 1) or _clip(experience, 1) or _clip(job, 1)):
        raise LLMError("Add a headline, some experience or a job advert first.")
    system = (
        "Suggest up to 8 skills this person could list on their CV, based on their experience "
        "and the job advert if given. Prefer concrete tools and abilities over vague traits. "
        "Skip anything they already list. Return ONLY a comma-separated list, each skill 1-3 words."
    )
    user = (f"Headline: {_clip(headline, 200)}\nExperience: {_clip(experience, 3000)}\n"
            f"Already listed: {_clip(have, 800)}") + _job_block(job)
    raw = _chat(cfg, system, user, temperature=0.4, max_tokens=200)
    seen = {s.strip().lower() for s in str(have or "").split(",")}
    out: List[str] = []
    for part in re.split(r"[,\n]", raw):
        name = re.sub(r"^[\s•\-*\d.]+", "", part).strip().strip(".")
        if name and len(name) <= 40 and name.lower() not in seen:
            seen.add(name.lower())
            out.append(name)
    return out[:8]


def draft_cover_letter(cfg: Config, context: Dict[str, str]) -> str:
    """Draft the body (3 short paragraphs) of a cover letter."""
    system = (
        "You are a career coach drafting cover letters. Output exactly three short paragraphs "
        "(why this role, why you fit, close), 150-220 words total, warm but professional, "
        "no clichés, no emojis, no placeholders in brackets. Do not include the salutation, "
        f"sign-off, address or date; those are added separately. {_NO_INVENT}"
    )
    relevant_keys = ["position_name", "company_name", "background_summary", "past_experience", "gained_skills"]
    ctx_lines = [f"- {k}: {_clip(context.get(k), 2000)}" for k in relevant_keys if _clip(context.get(k), 2000)]
    if not ctx_lines:
        raise LLMError("Fill in the job, company or some of your CV first.")
    user = "Candidate context:\n" + "\n".join(ctx_lines) + _job_block(context.get("job", ""))
    return _chat(cfg, system, user, temperature=0.55, max_tokens=700)


def _json_from(raw: str):
    """Pull the first JSON object out of a model reply (tolerates code fences)."""
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        raise LLMError("The AI didn't return a readable result. Try again.")
    try:
        return json.loads(raw[start:end + 1])
    except ValueError as e:
        raise LLMError("The AI didn't return a readable result. Try again.") from e


CV_SCHEMA_HINT = """{
  "personal": {"firstName": "", "lastName": "", "headline": "", "email": "", "phone": "", "location": "", "website": "", "linkedin": ""},
  "sections": [
    {"type": "summary", "title": "Profile", "items": [{"text": ""}]},
    {"type": "experience", "title": "Experience", "items": [{"role": "", "org": "", "location": "", "start": "", "end": "", "description": "one achievement per line"}]},
    {"type": "education", "title": "Education", "items": [{"degree": "", "org": "", "location": "", "start": "", "end": "", "grade": "", "description": ""}]},
    {"type": "projects", "title": "Projects", "items": [{"name": "", "link": "", "start": "", "end": "", "description": ""}]},
    {"type": "volunteering", "title": "Volunteering", "items": [{"role": "", "org": "", "location": "", "start": "", "end": "", "description": ""}]},
    {"type": "skills", "title": "Skills", "items": [{"name": "", "level": ""}]},
    {"type": "languages", "title": "Languages", "items": [{"name": "", "level": ""}]},
    {"type": "certifications", "title": "Certifications", "items": [{"name": "", "org": "", "end": ""}]},
    {"type": "awards", "title": "Awards", "items": [{"name": "", "org": "", "end": "", "description": ""}]},
    {"type": "interests", "title": "Interests", "items": [{"name": ""}]},
    {"type": "custom", "title": "Any other heading", "items": [{"name": "", "org": "", "location": "", "start": "", "end": "", "description": ""}]}
  ]
}"""


def parse_cv(cfg: Config, text: str) -> Dict[str, object]:
    """Structure the text of an existing CV into the editor's JSON shape."""
    text = _clip(text, 15000)
    if len(text) < 30:
        raise LLMError("There isn't enough text in that file to read a CV from.")
    system = (
        "You convert the text of a CV into JSON for a CV editor. Copy the person's own words; "
        "do not rewrite, summarise or improve them. " + _NO_INVENT + " "
        "Keep the sections in the order they appear and only include sections that exist. "
        "Put each bullet point on its own line in description. Dates as written (e.g. 'Jun 2023', '2021', 'Present'). "
        "Skill level must be one of Beginner, Intermediate, Advanced, Expert or empty; language level one of "
        "Native, Fluent, Advanced, Intermediate, Basic or empty. Return ONLY the JSON object, shaped like:\n" + CV_SCHEMA_HINT
    )
    raw = _chat(cfg, system, "CV text:\n\n" + text, temperature=0, max_tokens=6000)
    return _json_from(raw)


def translate_strings(cfg: Config, strings: Dict[str, str], language: str) -> Dict[str, str]:
    """Translate a flat {id: text} map, keeping ids, names and numbers."""
    language = _clip(language, 40)
    if not language:
        raise LLMError("Choose a language first.")
    clean = {str(k)[:40]: _clip(v, 2000) for k, v in list(strings.items())[:400] if _clip(v, 1)}
    if not clean:
        raise LLMError("There's nothing to translate yet.")
    if sum(len(v) for v in clean.values()) > 16000:
        raise LLMError("This CV is too long to translate in one go. Hide a section and try again.")
    system = (
        f"Translate the values of this JSON object into {language} for a CV. Keep every key exactly. "
        "Keep company names, school names, product names, technologies, email addresses, links and numbers unchanged. "
        "Use natural, professional CV wording in the target language and keep line breaks. "
        "Return ONLY the JSON object."
    )
    raw = _chat(cfg, system, json.dumps(clean, ensure_ascii=False), temperature=0.2, max_tokens=8000)
    data = _json_from(raw)
    if not isinstance(data, dict):
        raise LLMError("The AI didn't return a readable result. Try again.")
    return {k: _clip(data.get(k), 2000) for k in clean if isinstance(data.get(k), str) and data.get(k).strip()}
