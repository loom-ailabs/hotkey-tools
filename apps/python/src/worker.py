"""Cloudflare runtime entry point; CPython imports the FastAPI app directly."""

from workers import asgi

from hotkey_tools.main import app

Default = asgi.entrypoint(app)
