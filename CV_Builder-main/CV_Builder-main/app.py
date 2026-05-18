"""Entry point.

Exposes `app` for WSGI (Vercel, gunicorn) and provides a dev server under
`python app.py`. All business logic lives in the `resume_builder` package.
"""

from resume_builder import create_app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
