# CV Builders — CV & Cover Letter Builder

Pick one of 10 templates, fill in your details, and watch your CV take shape on the page as you type. Change the template, colour, font, size or section order at any time without retyping anything, then download a PDF that looks exactly like the preview, an editable Word file, or a backup you can open again later.

---

## Features

- **10 templates in 5 styles** (Professional, Modern, Minimal, Creative, Classic), each previewed live with sample content on the home page and the `/templates` gallery.
- **Live, editable page.** The CV is drawn in the browser from a small JSON document. Click any part of the page to jump to its form.
- **Design controls:** template, accent colour (swatches or any colour), 5 fonts, text size, spacing, A4 or US Letter, photo on/off.
- **Flexible sections:** Profile, Experience, Education, Projects, Volunteering, Skills, Languages, Certifications, Awards, Interests and custom sections. Rename, hide, reorder by drag, and reorder entries.
- **Several CVs at once:** rename, duplicate one for another job, start from an example, delete.
- **CV strength meter** with the next most useful tip, linked to the right section.
- **Undo / redo**, autosave in the browser, and a page-break marker with a page count.
- **Cover letter** that reuses your details and design.
- **Downloads:** PDF through the browser's print dialog (matches the preview), Word (.docx, a single-column ATS-friendly layout with your colour, font and section order), and a JSON backup.
- **Optional AI helpers** (any OpenAI-compatible API): write a profile, improve or shorten an achievement, draft a cover letter. Hidden when no API key is set.

---

## How it fits together

| Piece | File |
|---|---|
| Template list (name, category, layout, default colour and font) | `resume_builder/templates_registry.py` |
| CV data model, renderer, strength score | `static/cv/engine.js` |
| Template styles | `static/cv/cv.css` |
| Live thumbnails on home and gallery | `static/cv/mini.js` |
| Editor (state, panels, preview, downloads) | `static/cv/editor.js`, `templates/editor.html` |
| Word export | `resume_builder/services/docx_builder.py` → `POST /api/export/docx` |
| AI helpers | `resume_builder/services/llm.py` → `/api/llm/*` |

Adding a template is two steps: add a `Template(...)` entry to the registry and a `.cv--<id>` block in `cv.css`.

Nothing is stored on the server. CVs live in the visitor's browser (`localStorage`), and the backup file moves them between devices.

---

## Setup

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Optional environment variables:

```bash
SECRET_KEY=change-me-in-prod
LLM_API_KEY=sk-...                       # leave blank to hide AI helpers
LLM_BASE_URL=https://api.openai.com/v1   # or http://localhost:11434/v1 for Ollama
LLM_MODEL=gpt-4o-mini
```

Run and test:

```bash
python app.py          # http://127.0.0.1:5000
pytest
```

Deploys to Vercel as is (`vercel.json`, `api/index.py`). No PDF converter is needed on the server.

---

## Known limitations

- The Word file uses one clean layout for every template; two-column designs and photos are only in the PDF.
- CVs are kept per browser. Moving to another device means downloading a backup and opening it there.
