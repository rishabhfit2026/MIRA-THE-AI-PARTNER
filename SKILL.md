---
name: "mira-ai-partner"
description: "Maintain and extend MIRA, a bilingual voice-first personal AI partner for health routines, reminders, and conversational support."
---

# Objective

Build and improve MIRA as a voice-first AI partner that feels conversational, supportive, and practical for day-to-day life management. The product focus is:

- natural voice interaction
- bilingual English and Hindi support, including Hinglish usage
- routine tracking for wake, sleep, meals, hydration, exercise, and check-ins
- personal reminders and gentle accountability
- a path toward richer real-time voice and browser automation later

# Current Product Shape

MIRA is currently a local FastAPI application with a browser UI.

- Backend: FastAPI app for profile state, reminders, chat memory, and check-ins
- Frontend: HTML, CSS, and browser-side JavaScript
- Voice I/O: Web Speech API for speech recognition and speech synthesis
- Persistence: local JSON state in `data/assistant_state.json`
- LLM path: optional OpenAI API call when `OPENAI_API_KEY` is configured

# Working Rules

- Preserve the voice-first experience. Do not regress into a text-only planner.
- Prefer simple local-first implementations before adding infrastructure.
- Keep bilingual support explicit in UX and prompts.
- Protect user privacy. Do not commit secrets, personal health data, or runtime state.
- When changing conversation behavior, verify both typed chat and voice mode still work.
- If adding integrations, document setup clearly in `README.md`.

# Priority Areas

1. Improve real-time voice experience so it feels closer to a human conversation.
2. Strengthen Hindi, English, and Hinglish understanding and response quality.
3. Add better structured actions for schedule updates and reminders.
4. Add phone-facing delivery channels like WhatsApp, Telegram, notifications, or calendar sync.
5. Add browser automation or MCP-based control only as a separate, clearly scoped layer.

# File Map

- `app/main.py`: API routes and page serving
- `app/assistant.py`: prompt building, fallback logic, reminder handling, and assistant behavior
- `app/models.py`: Pydantic models
- `app/store.py`: local persistence
- `app/templates/index.html`: UI layout
- `app/static/app.js`: voice mode, speech loop, and client interactions
- `app/static/styles.css`: UI styling

# Done Definition

A change is complete only if:

- the core flow still runs locally
- Python files compile cleanly
- the voice controls still behave coherently in the browser
- documentation matches the actual implementation

