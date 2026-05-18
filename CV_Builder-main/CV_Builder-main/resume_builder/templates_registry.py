"""Template registry.

Each entry defines one design that can drive both a CV and a Cover Letter.
When a template's own DOCX isn't authored yet, it transparently falls back
to the Finance template so the app stays functional.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, List, Optional


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DOCX_TPL_DIR = os.path.join(BASE_DIR, "docx_templates")


@dataclass(frozen=True)
class Template:
    id: str
    name: str
    tagline: str
    description: str
    icon: str
    cv_filename: str
    cl_filename: str
    ready: bool

    def cv_path(self) -> str:
        path = os.path.join(DOCX_TPL_DIR, self.cv_filename)
        if os.path.exists(path):
            return path
        return os.path.join(DOCX_TPL_DIR, "finance_resume.docx")

    def cl_path(self) -> str:
        path = os.path.join(DOCX_TPL_DIR, self.cl_filename)
        if os.path.exists(path):
            return path
        return os.path.join(DOCX_TPL_DIR, "finance_cover_letter.docx")


_TEMPLATES: List[Template] = [
    Template(
        id="finance",
        name="Finance",
        tagline="Investment Banking · Consulting · PE",
        description="Classic Wall-Street style. Optimized for the WSO / IB resume format recruiters expect.",
        icon="💼",
        cv_filename="finance_resume.docx",
        cl_filename="finance_cover_letter.docx",
        ready=True,
    ),
    Template(
        id="tech",
        name="Tech",
        tagline="SWE · Product · Data",
        description="Clean single-column layout with space for links, stack tags and quantified impact.",
        icon="⚡",
        cv_filename="tech_resume.docx",
        cl_filename="tech_cover_letter.docx",
        ready=True,
    ),
    Template(
        id="generic",
        name="Generic",
        tagline="Works for any industry",
        description="Conservative, ATS-friendly layout with no industry-specific sections.",
        icon="📄",
        cv_filename="generic_resume.docx",
        cl_filename="generic_cover_letter.docx",
        ready=True,
    ),
]

_BY_ID: Dict[str, Template] = {t.id: t for t in _TEMPLATES}

DEFAULT_TEMPLATE_ID = "finance"


def list_templates() -> List[Template]:
    return list(_TEMPLATES)


def get_template(template_id: Optional[str]) -> Template:
    if template_id and template_id in _BY_ID:
        return _BY_ID[template_id]
    return _BY_ID[DEFAULT_TEMPLATE_ID]
