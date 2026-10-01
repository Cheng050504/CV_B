"""Template registry.

Each template is a look for the browser-drawn CV (see ``static/cv/engine.js``
and ``static/cv/cv.css``). The registry is the single list the home page,
the gallery and the editor all read; the editor receives it as JSON.

``layout`` tells the engine where sections go:
  * ``single``  one column
  * ``side-left`` / ``side-right``  a narrow column holds the short lists
    (skills, languages, interests, certifications)
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Dict, List, Optional


@dataclass(frozen=True)
class Template:
    id: str
    name: str
    category: str
    tagline: str
    description: str
    layout: str
    accent: str
    font: str
    photo: bool = False

    def to_dict(self) -> Dict[str, object]:
        return asdict(self)


CATEGORIES = ["Professional", "Modern", "Minimal", "Creative", "Classic"]

FONTS = {
    "inter": {"label": "Inter", "body": "'Inter', Arial, sans-serif", "head": "'Inter', Arial, sans-serif", "docx": "Calibri"},
    "jakarta": {"label": "Plus Jakarta", "body": "'Inter', Arial, sans-serif", "head": "'Plus Jakarta Sans', Arial, sans-serif", "docx": "Calibri"},
    "lora": {"label": "Lora", "body": "'Lora', Georgia, serif", "head": "'Lora', Georgia, serif", "docx": "Georgia"},
    "garamond": {"label": "Garamond", "body": "'EB Garamond', Garamond, Georgia, serif", "head": "'EB Garamond', Garamond, Georgia, serif", "docx": "Garamond"},
    "plex": {"label": "IBM Plex", "body": "'IBM Plex Sans', Arial, sans-serif", "head": "'IBM Plex Mono', 'Courier New', monospace", "docx": "Arial"},
}

_TEMPLATES: List[Template] = [
    Template("clean", "Clean", "Professional", "Works for any role",
             "A crisp single column with a coloured name and tidy section rules.",
             "single", "#2F5D8A", "inter"),
    Template("modern", "Modern", "Modern", "Sidebar for skills",
             "A soft tinted sidebar keeps contacts and skills easy to scan.",
             "side-left", "#3E7C6F", "jakarta", photo=True),
    Template("minimal", "Minimal", "Minimal", "Quiet and airy",
             "Dates in a left column and plenty of white space.",
             "single", "#252525", "inter"),
    Template("creative", "Creative", "Creative", "Warm and personal",
             "A coral header with your photo and a two-column body.",
             "side-right", "#E9785B", "jakarta", photo=True),
    Template("classic", "Classic", "Classic", "Finance & consulting",
             "Centred name, serif type and ruled headings, the traditional banking format.",
             "single", "#111111", "garamond"),
    Template("executive", "Executive", "Professional", "Senior roles",
             "A deep header band with a confident, structured body.",
             "single", "#1F3A5F", "lora"),
    Template("timeline", "Timeline", "Creative", "Tell your story",
             "Your experience laid out along a gentle timeline.",
             "single", "#7A6FBF", "jakarta"),
    Template("tech", "Tech", "Modern", "Engineering & data",
             "Monospace headings and skill chips for technical roles.",
             "side-right", "#2E7D5B", "plex"),
    Template("elegant", "Elegant", "Classic", "Refined serif",
             "Small caps, fine lines and a centred header.",
             "single", "#8A6A4F", "lora"),
    Template("compact", "Compact", "Minimal", "Fits more on one page",
             "Tighter spacing and a slim sidebar for long histories.",
             "side-left", "#4A5A6A", "inter"),
]

_BY_ID: Dict[str, Template] = {t.id: t for t in _TEMPLATES}

DEFAULT_TEMPLATE_ID = "clean"


def list_templates() -> List[Template]:
    return list(_TEMPLATES)


def get_template(template_id: Optional[str]) -> Template:
    if template_id and template_id in _BY_ID:
        return _BY_ID[template_id]
    return _BY_ID[DEFAULT_TEMPLATE_ID]


def featured_templates() -> List[Template]:
    """One template per category, in category order, for the home page."""
    picked: List[Template] = []
    for cat in CATEGORIES:
        for t in _TEMPLATES:
            if t.category == cat:
                picked.append(t)
                break
    return picked
