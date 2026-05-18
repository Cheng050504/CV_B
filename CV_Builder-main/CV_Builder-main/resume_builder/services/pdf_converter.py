"""DOCX → PDF conversion, best-effort.

Strategy (first one that succeeds wins):
  1. ``docx2pdf``          — needs Microsoft Word (Windows/macOS).
  2. LibreOffice headless  — needs ``soffice`` on PATH (common on Linux).

Both are optional; if neither is available we simply return None and the UI
falls back to DOCX-only download.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from typing import Optional


def _try_docx2pdf(docx_path: str, out_dir: str) -> Optional[str]:
    try:
        from docx2pdf import convert  # type: ignore
    except Exception:
        return None
    try:
        pdf_path = os.path.join(out_dir, os.path.splitext(os.path.basename(docx_path))[0] + ".pdf")
        convert(docx_path, pdf_path)
        return pdf_path if os.path.exists(pdf_path) else None
    except Exception:
        return None


def _try_libreoffice(docx_path: str, out_dir: str) -> Optional[str]:
    try:
        subprocess.run(
            ["soffice", "--headless", "--convert-to", "pdf", "--outdir", out_dir, docx_path],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60,
        )
    except Exception:
        return None
    pdf_path = os.path.join(out_dir, os.path.splitext(os.path.basename(docx_path))[0] + ".pdf")
    return pdf_path if os.path.exists(pdf_path) else None


def docx_bytes_to_pdf_bytes(docx_bytes: bytes, basename: str = "document") -> Optional[bytes]:
    """Convert DOCX bytes → PDF bytes; returns None if no converter available."""
    safe = basename or "document"
    with tempfile.TemporaryDirectory() as tmp:
        docx_path = os.path.join(tmp, f"{safe}.docx")
        with open(docx_path, "wb") as f:
            f.write(docx_bytes)

        for attempt in (_try_docx2pdf, _try_libreoffice):
            pdf_path = attempt(docx_path, tmp)
            if pdf_path:
                try:
                    with open(pdf_path, "rb") as pf:
                        return pf.read()
                except Exception:
                    continue
    return None
