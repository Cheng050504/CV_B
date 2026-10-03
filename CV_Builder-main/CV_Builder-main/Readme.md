# CV Builders — CV & Cover Letter Builder

Pick one of 45 templates, fill in your details, and watch your CV take shape on the page as you type. Change the template, colour, font, size or section order at any time without retyping anything, then download a PDF that looks exactly like the preview, an editable Word file, or a backup you can open again later.

---

## Features

- **45 templates in 6 styles** (Original, Professional, Modern, Minimal, Creative, Classic), each previewed live with sample content on the home page and the `/templates` gallery.
- **Live, editable page.** The CV is drawn in the browser from a small JSON document. Click any part of the page to jump to its form.
- **Styles from popular resume catalogues:** one-page LaTeX look, university format, EU-style labels, Lebenslauf with photo, infographic dot ratings, skill bars, boxed form, Swiss grid, newspaper masthead, gradient header, vertical name strip and more.
- **Original formats:** Finance, Generic and Tech Classic recreate the three templates from the first version of cvbuilders.org (employer and location on one line, role and dates on the next, skills as short lines).
- **Design controls:** template, accent colour (swatches or any colour), 11 fonts, text size, spacing, A4 or US Letter, photo on/off.
- **Flexible sections:** Profile, Experience, Education, Projects, Volunteering, Skills, Languages, Certifications, Awards, Interests and custom sections. Rename, hide, reorder by drag, and reorder entries.
- **Import an existing CV.** Upload a PDF, Word (.docx) or text file and the sections are filled in as a new CV. With an AI key it reads unusual layouts; without one a built-in reader picks out contact details, roles, dates, degrees, skills and levels. The file is read in memory and never stored.
- **Fit to one page.** When a CV spills onto a second page, one click tries tighter spacing and smaller text (then a slight scale-down) until it fits, with undo.
- **Job match score.** Paste a job advert to see a score, the advert's key terms the CV already uses, and the ones it is missing. Tap a missing term to add it to Skills. Runs in the browser, no AI needed.
- **Writing tips as you type** under the profile and each role: weak openers ("Responsible for"), "I" and "my", present tense for a finished job, missing numbers, long lines and clichés.
- **Smarter template picker:** filter by one or two columns, with or without photo, and ATS-friendly; preview every thumbnail with your own CV instead of the example.
- **Tailored copies and an application tracker.** Make a copy of a CV for one job and keep a list of applications with status (Saved, Applied, Interview, Offer, Rejected), date and links.
- **Translate a CV** into another language as a new copy with the same design (uses AI). Names, companies and numbers stay as they are.
- **Several CVs at once:** rename, duplicate one for another job, start from an example, delete.
- **CV strength meter** with the next most useful tip, linked to the right section.
- **Undo / redo**, autosave in the browser, and a page-break marker with a page count.
- **Cover letter** that reuses your details and design.
- **Downloads:** PDF through the browser's print dialog (matches the preview), Word (.docx, a single-column ATS-friendly layout with your colour, font and section order), and a JSON backup.
- **AI writing assistant, bring your own key.** Visitors paste a key from Claude (Anthropic), OpenAI, Google Gemini or OpenRouter in *AI assistant*. It can write a profile, turn rough notes into achievements, improve or shorten text, suggest missing skills and draft the cover letter, all tailored to a pasted job advert. The key stays in the visitor's browser and is sent with each AI request only; the server never stores or logs it. Providers are a fixed allowlist, so the server never calls an arbitrary URL.

---

## How it fits together

| Piece | File |
|---|---|
| Template list (name, category, layout, default colour and font) | `resume_builder/templates_registry.py` |
| CV data model, renderer, strength score | `static/cv/engine.js` |
| Template styles | `static/cv/cv.css` |
| Live thumbnails on home and gallery | `static/cv/mini.js` |
| Editor (state, panels, preview, downloads, fit to page, applications) | `static/cv/editor.js`, `templates/editor.html` |
| Job match and writing tips (no AI) | `static/cv/insights.js` |
| CV import (PDF via `pypdf`, Word via `python-docx`) | `resume_builder/services/cv_import.py` → `POST /api/import` |
| Word export | `resume_builder/services/docx_builder.py` → `POST /api/export/docx` |
| AI helpers (Claude via the `anthropic` SDK, others via OpenAI-compatible APIs) | `resume_builder/services/llm.py` → `/api/llm/*` |

Adding a template is two steps: add a `Template(...)` entry to the registry and a `.cv--<id>` block in `cv.css`.

Nothing is stored on the server. CVs and the application list live in the visitor's browser (`localStorage`), and the backup file moves them between devices.

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
# Optional site-wide AI key, used when a visitor hasn't added their own.
LLM_PROVIDER=anthropic                   # anthropic | openai | gemini | openrouter
LLM_API_KEY=...
LLM_MODEL=                               # blank = the provider's default
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
- Import without AI works best on simple, one-column CVs. Scanned PDFs (images of text) can't be read.
- CVs are kept per browser. Moving to another device means downloading a backup and opening it there.
