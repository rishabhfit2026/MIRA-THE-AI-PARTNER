from __future__ import annotations

import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_FILE = DATA_DIR / "assistant_state.json"


def get_openai_api_key() -> str | None:
    return os.getenv("OPENAI_API_KEY")


def get_model() -> str:
    return os.getenv("OPENAI_MODEL", "gpt-4.1-mini")


def get_realtime_model() -> str:
    return os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime")
