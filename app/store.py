from __future__ import annotations

import json
from datetime import datetime

from .config import DATA_DIR, DATA_FILE
from .models import AssistantState, ChatMessage, Reminder


def _default_reminders() -> list[Reminder]:
    return [
        Reminder(id="wake", label="Wake up and start your day", time="07:00", kind="wake"),
        Reminder(id="breakfast", label="Breakfast time", time="08:30", kind="meal"),
        Reminder(id="lunch", label="Lunch time", time="13:30", kind="meal"),
        Reminder(id="exercise", label="Move your body for at least 20 minutes", time="18:30", kind="exercise"),
        Reminder(id="dinner", label="Dinner time", time="20:30", kind="meal"),
        Reminder(id="sleep", label="Start winding down for sleep", time="23:00", kind="sleep"),
    ]


def load_state() -> AssistantState:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        state = AssistantState(reminders=_default_reminders())
        save_state(state)
        return state

    raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    state = AssistantState.model_validate(raw)
    if not state.reminders:
        state.reminders = _default_reminders()
        save_state(state)
    return state


def save_state(state: AssistantState) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        json.dumps(state.model_dump(), ensure_ascii=True, indent=2),
        encoding="utf-8",
    )


def append_chat_message(state: AssistantState, role: str, content: str) -> None:
    state.chat_history.append(
        ChatMessage(
            role=role,
            content=content,
            created_at=datetime.now().isoformat(timespec="seconds"),
        )
    )

    # Keep memory bounded for a lightweight local app.
    if len(state.chat_history) > 30:
        state.chat_history = state.chat_history[-30:]

