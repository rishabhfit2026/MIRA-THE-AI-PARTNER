from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date
import json
from urllib import error, request as urlrequest

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .assistant import (
    add_checkin,
    build_realtime_session_payload,
    due_reminders,
    generate_reply,
    upsert_reminder,
)
from .config import get_openai_api_key
from .models import (
    AssistantState,
    ChatRequest,
    ChatResponse,
    CheckinPayload,
    ProfileUpdate,
    RealtimeSessionRequest,
    ReminderPayload,
)
from .store import load_state, save_state


state: AssistantState = load_state()


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    save_state(state)


app = FastAPI(title="Health Voice Assistant", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"today": date.today().isoformat(), "profile": state.profile},
    )


@app.get("/api/state", response_model=AssistantState)
async def get_state():
    return state


@app.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    reply, actions = generate_reply(state, payload.message.strip())
    save_state(state)
    return ChatResponse(reply=reply, state=state, actions=actions)


@app.post("/api/profile", response_model=AssistantState)
async def update_profile(payload: ProfileUpdate):
    state.profile = state.profile.model_copy(update=payload.model_dump())

    upsert_reminder(state, label="Wake up and start your day", time=state.profile.wake_time, kind="wake", reminder_id="wake")
    upsert_reminder(state, label="Breakfast time", time=state.profile.breakfast_time, kind="meal", reminder_id="breakfast")
    upsert_reminder(state, label="Lunch time", time=state.profile.lunch_time, kind="meal", reminder_id="lunch")
    upsert_reminder(state, label="Move your body for at least 20 minutes", time=state.profile.exercise_time, kind="exercise", reminder_id="exercise")
    upsert_reminder(state, label="Dinner time", time=state.profile.dinner_time, kind="meal", reminder_id="dinner")
    upsert_reminder(state, label="Start winding down for sleep", time=state.profile.sleep_time, kind="sleep", reminder_id="sleep")

    save_state(state)
    return state


@app.post("/api/reminders", response_model=AssistantState)
async def create_reminder(payload: ReminderPayload):
    upsert_reminder(state, label=payload.label, time=payload.time, kind=payload.kind)
    save_state(state)
    return state


@app.get("/api/reminders/due")
async def get_due_reminders():
    reminders = due_reminders(state)
    if reminders:
        save_state(state)
    return {"items": reminders}


@app.post("/api/checkin", response_model=AssistantState)
async def post_checkin(payload: CheckinPayload):
    add_checkin(state, payload)
    save_state(state)
    return state


@app.post("/api/realtime/token")
async def create_realtime_token(payload: RealtimeSessionRequest):
    api_key = get_openai_api_key()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured on the server.",
        )

    session_payload = build_realtime_session_payload(
        state,
        voice=payload.voice,
        language_mode=payload.language_mode,
    )
    req = urlrequest.Request(
        "https://api.openai.com/v1/realtime/client_secrets",
        data=json.dumps(session_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlrequest.urlopen(req, timeout=25) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=exc.code, detail=detail) from exc
    except error.URLError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to reach OpenAI Realtime API: {exc.reason}",
        ) from exc
