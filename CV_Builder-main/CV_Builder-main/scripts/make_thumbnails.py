"""Render a preview PNG of each template's CV for the home page gallery.

Fills every template with the same sample person, converts the DOCX to PDF
with LibreOffice and rasterises page 1 with pdftoppm. Re-run after editing
a template in docx_templates/:

    python scripts/make_thumbnails.py

Requires `soffice` and `pdftoppm` (poppler-utils) on PATH.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile

from werkzeug.datastructures import MultiDict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from resume_builder.services.docx_renderer import build_documents  # noqa: E402
from resume_builder.templates_registry import list_templates  # noqa: E402

OUT_DIR = os.path.join(ROOT, "static", "img", "templates")

SAMPLE = MultiDict([
    ("first_name", "Alexandra"), ("last_name", "Chen"),
    ("email", "alex.chen@example.com"), ("phone", "+1 (555) 201-9034"),
    ("physical_address", "420 W 42nd St, New York, NY 10036"),
    ("languages", "English, Mandarin"), ("languages_secondary", "Spanish"),
    ("technical_skills", "Python, SQL, Excel, Bloomberg, FactSet"),
    ("certifications", "CFA Level I Candidate"),
    ("activities", "President, Columbia Investment Club"),
    ("interests", "Long-distance running, chess, architecture"),
    ("ed_school[]", "Columbia University"), ("ed_city[]", "New York"),
    ("ed_state[]", "NY"), ("ed_country[]", "USA"), ("ed_degree_type[]", "Arts"),
    ("ed_field[]", "Economics and Mathematics"), ("ed_start[]", "2023/09"),
    ("ed_end[]", "2027/05"), ("ed_gpa[]", "3.92"), ("ed_sat[]", "1540"),
    ("ed_honors[]", "Dean's List (3x)"),
    ("ed_courses[]", "Corporate Finance, Econometrics, Financial Accounting"),
    ("e_company[]", "Morgan Stanley"), ("e_city[]", "New York"), ("e_state[]", "NY"),
    ("e_country[]", "USA"), ("e_title[]", "Summer Analyst"),
    ("e_group[]", "Equity Research"), ("e_start[]", "2025/06"), ("e_end[]", "2025/08"),
    ("e_summary[]", "Built a 5-company comparable set used in 4 sector notes\n"
                    "Drafted initiation-of-coverage sections read by 2 portfolio managers\n"
                    "Automated a weekly data pull in Python, saving 3 hours a week"),
    ("e_company[]", "Columbia Investment Club"), ("e_city[]", "New York"), ("e_state[]", "NY"),
    ("e_country[]", "USA"), ("e_title[]", "President"), ("e_group[]", ""),
    ("e_start[]", "2024/09"), ("e_end[]", "Present"),
    ("e_summary[]", "Grew active membership from 40 to 120 across 3 semesters\n"
                    "Led a 6-person team to the CFA Research Challenge regionals"),
])


def main() -> int:
    for tool in ("soffice", "pdftoppm"):
        if not shutil.which(tool):
            print(f"missing {tool}", file=sys.stderr)
            return 1
    os.makedirs(OUT_DIR, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for tpl in list_templates():
            docs = build_documents(SAMPLE, tpl.cv_path(), tpl.cl_path())
            docx = os.path.join(tmp, f"{tpl.id}.docx")
            with open(docx, "wb") as fh:
                fh.write(docs["cv_docx_bytes"])
            subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", tmp, docx],
                           check=True, capture_output=True)
            out = os.path.join(OUT_DIR, tpl.id)
            subprocess.run(["pdftoppm", "-png", "-f", "1", "-l", "1", "-scale-to-x", "640",
                            "-scale-to-y", "-1", "-singlefile", os.path.join(tmp, f"{tpl.id}.pdf"), out],
                           check=True)
            print("wrote", out + ".png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
