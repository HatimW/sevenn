"""Sevenn placeholder application entry point.

This module exposes a tiny Flask application for future experimentation.
Running it will start a development web server that responds with a friendly
greeting.
"""

from __future__ import annotations

from flask import Flask, jsonify


def greet(name: str) -> str:
    """Return a friendly greeting for the provided ``name``."""
    return f"Hello, {name}! Welcome to Sevenn."


def create_app() -> Flask:
    """Create and configure a small Flask application."""

    app = Flask(__name__)

    @app.get("/hello/<name>")
    def hello(name: str):  # pragma: no cover - trivial wrapper
        return jsonify(message=greet(name))

    return app


def main() -> None:
    """Run the development server when executed as a script."""
    app = create_app()
    app.run(debug=True)


if __name__ == "__main__":  # pragma: no cover
    main()
