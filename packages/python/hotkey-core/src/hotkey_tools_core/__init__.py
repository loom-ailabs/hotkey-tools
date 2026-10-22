"""Shared hotkey utilities for Python applications."""


def normalize_combination(value: str) -> str:
    parts = [part.strip() for part in value.split("+") if part.strip()]
    return " + ".join(part[:1].upper() + part[1:].lower() for part in parts)
