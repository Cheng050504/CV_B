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
    # Original cvbuilders formats: employer/school first, lists as lines.
    org_first: bool = False
    lines: bool = False

    @property
    def ats(self) -> bool:
        """One column and no photo: the layouts tracking systems read most reliably."""
        return self.layout == "single" and not self.photo and self.id not in NOT_ATS

    def to_dict(self) -> Dict[str, object]:
        return dict(asdict(self), ats=self.ats)


# Single-column designs whose text order is unusual for parsers.
NOT_ATS = {"vertical"}

CATEGORIES = ["Original", "Professional", "Modern", "Minimal", "Creative", "Classic"]

FONTS = {
    "inter": {"label": "Inter", "body": "'Inter', Arial, sans-serif", "head": "'Inter', Arial, sans-serif", "docx": "Calibri"},
    "jakarta": {"label": "Plus Jakarta", "body": "'Inter', Arial, sans-serif", "head": "'Plus Jakarta Sans', Arial, sans-serif", "docx": "Calibri"},
    "lora": {"label": "Lora", "body": "'Lora', Georgia, serif", "head": "'Lora', Georgia, serif", "docx": "Georgia"},
    "garamond": {"label": "Garamond", "body": "'EB Garamond', Garamond, Georgia, serif", "head": "'EB Garamond', Garamond, Georgia, serif", "docx": "Garamond"},
    "dm": {"label": "DM Sans", "body": "'DM Sans', Arial, sans-serif", "head": "'DM Sans', Arial, sans-serif", "docx": "Arial"},
    "playfair": {"label": "Playfair", "body": "'Inter', Arial, sans-serif", "head": "'Playfair Display', Georgia, serif", "docx": "Georgia"},
    "merriweather": {"label": "Merriweather", "body": "'Merriweather', Georgia, serif", "head": "'Merriweather', Georgia, serif", "docx": "Georgia"},
    "times": {"label": "Times", "body": "'Times New Roman', Tinos, Times, serif", "head": "'Times New Roman', Tinos, Times, serif", "docx": "Times New Roman"},
    "sourceserif": {"label": "Source Serif", "body": "'Source Serif 4', Georgia, serif", "head": "'Source Serif 4', Georgia, serif", "docx": "Cambria"},
    "grotesk": {"label": "Space Grotesk", "body": "'Inter', Arial, sans-serif", "head": "'Space Grotesk', Arial, sans-serif", "docx": "Arial"},
    "plex": {"label": "IBM Plex", "body": "'IBM Plex Sans', Arial, sans-serif", "head": "'IBM Plex Mono', 'Courier New', monospace", "docx": "Arial"},
}

_TEMPLATES: List[Template] = [
    # The three formats from the original cvbuilders.org.
    Template("finance", "Finance", "Original", "Banking, consulting & PE",
             "The original cvbuilders format: centred name, ruled headings, employer and dates on one line.",
             "single", "#111111", "times", org_first=True, lines=True),
    Template("generic", "Generic", "Original", "Works for any industry",
             "The original all-rounder: bold name and centred headings between two rules.",
             "single", "#111111", "times", org_first=True, lines=True),
    Template("techline", "Tech Classic", "Original", "Software, product & data",
             "The original tech format: a blue name, blue headings and a compact single column.",
             "single", "#1F4E79", "dm", org_first=True, lines=True),
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
    Template("bold", "Bold", "Modern", "Make a strong first impression",
             "A large name, a thick accent rule and confident headings.",
             "single", "#D9480F", "dm"),
    Template("slate", "Slate", "Modern", "Dark sidebar",
             "A deep coloured sidebar with your photo, contacts and skills.",
             "side-left", "#2B3A4A", "dm", photo=True),
    Template("academic", "Academic", "Classic", "Research & teaching",
             "Section titles sit in their own column, like a scholarly CV.",
             "single", "#3D3D3D", "merriweather"),
    Template("fresh", "Fresh", "Creative", "Friendly and soft",
             "Each section sits on a soft tinted card with rounded corners.",
             "single", "#6B8F71", "jakarta"),
    Template("studio", "Studio", "Creative", "Design & media",
             "An editorial serif name and a slim sidebar with your photo.",
             "side-left", "#B4446C", "playfair", photo=True),
    Template("corporate", "Corporate", "Professional", "Business & operations",
             "A strong top stripe and a ruled sidebar for key facts.",
             "side-right", "#0B5394", "inter"),
    Template("nordic", "Nordic", "Minimal", "Light and calm",
             "Spaced-out capitals, hairline rules and lots of breathing room.",
             "single", "#5B7B8A", "dm"),
    Template("consultant", "Consultant", "Professional", "Consulting & strategy",
             "Name on the left, contacts on the right, square accent markers.",
             "single", "#14532D", "inter"),
    Template("mono", "Mono", "Minimal", "Developers & writers",
             "Black and white with typewriter-style headings.",
             "single", "#111111", "plex"),
    Template("ribbon", "Ribbon", "Creative", "Students & first jobs",
             "Section titles sit on colourful ribbon labels.",
             "single", "#E07A5F", "jakarta"),
    # Styles found in a survey of popular resume template catalogues (2026-10).
    Template("engineer", "Engineer", "Minimal", "Software & STEM, one dense page",
             "The popular LaTeX look: small-caps headings, tight spacing and right-aligned dates.",
             "single", "#111111", "sourceserif", org_first=True),
    Template("ivy", "Ivy", "Classic", "Students & graduates",
             "The university careers-office format: serif, centred name, bullets under each role.",
             "single", "#111111", "garamond", org_first=True),
    Template("graduate", "Graduate", "Modern", "First jobs & internships",
             "Friendly sans-serif with a short accent bar under each heading.",
             "single", "#2563EB", "jakarta"),
    Template("skillbar", "Skill Bars", "Creative", "Show your strengths",
             "A photo sidebar where skills and languages show as level bars.",
             "side-left", "#0F766E", "dm", photo=True),
    Template("rail", "Rail", "Professional", "Highlights at a glance",
             "A wide main column with a coloured rail on the right for skills and facts.",
             "side-right", "#9A3412", "inter"),
    Template("duo", "Duo", "Modern", "Two-colour accent",
             "Headings in your colour, dates and links in a warm second colour.",
             "single", "#1D4ED8", "dm"),
    Template("infographic", "Infographic", "Creative", "Visual and bold",
             "Round heading markers and dot ratings for skills and languages.",
             "side-right", "#7C3AED", "jakarta", photo=True),
    Template("euro", "Euro", "Classic", "European standard style",
             "Labels in a right-aligned column beside a fine vertical line, like the EU format.",
             "single", "#1E40AF", "inter"),
    Template("grid", "Grid", "Minimal", "Ordered and boxed",
             "Each section sits in a ruled box with a tinted title row, like a form.",
             "single", "#374151", "inter"),
    Template("monogram", "Monogram", "Modern", "Personal brand",
             "Your initials in a badge beside the name, with soft rules.",
             "single", "#B45309", "lora"),
    Template("banner", "Banner", "Modern", "Clear sections",
             "Section titles sit on full-width coloured bars.",
             "single", "#0E7490", "dm"),
    Template("edge", "Edge", "Professional", "Structured and clean",
             "Each section is marked by a strong accent line down its left edge.",
             "single", "#BE123C", "inter"),
    Template("swiss", "Swiss", "Minimal", "Design-led grid",
             "A big grotesque name, a strict grid and small headings in the margin.",
             "single", "#DC2626", "grotesk"),
    Template("gazette", "Gazette", "Classic", "Editorial & writing",
             "A newspaper masthead with double rules and serif type.",
             "single", "#111111", "playfair"),
    Template("aurora", "Aurora", "Creative", "Bright and modern",
             "A soft gradient header with rounded section markers.",
             "single", "#DB2777", "jakarta"),
    Template("portrait", "Portrait", "Creative", "Photo-first",
             "A large round photo centred above your name.",
             "single", "#4D7C0F", "dm", photo=True),
    Template("signature", "Signature", "Creative", "Personal touch",
             "Your name in a handwritten script over a calm serif body.",
             "single", "#57534E", "lora"),
    Template("vertical", "Vertical", "Creative", "Stand out on the page",
             "Your name runs up a coloured strip down the left of the page.",
             "single", "#0F172A", "grotesk"),
    Template("frame", "Frame", "Classic", "Formal and finished",
             "A fine double frame around the page and centred headings.",
             "single", "#78350F", "merriweather"),
    Template("pastel", "Pastel", "Modern", "Soft and friendly",
             "A rounded pastel sidebar and gentle chips for skills.",
             "side-right", "#C026D3", "jakarta"),
    Template("split", "Split", "Professional", "Business & sales",
             "Name on the left, contacts in a coloured panel on the right.",
             "single", "#065F46", "inter"),
    Template("tabular", "Tabular", "Professional", "German & Swiss style",
             "Dates in a left column and a photo top right, like a Lebenslauf.",
             "single", "#334155", "inter", photo=True),
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
