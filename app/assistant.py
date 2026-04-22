from __future__ import annotations

import json
import re
from datetime import date, datetime
from urllib import error, request

from .config import get_model, get_openai_api_key, get_realtime_model
from .models import AssistantState, CheckinPayload, DailyCheckin, Reminder
from .store import append_chat_message


TIME_PATTERN = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")
EMOTION_PATTERN = re.compile(
    r"\b(sad|lonely|anxious|stressed|overwhelmed|hurt|empty|down|crying|depressed|tired|low)\b",
    re.IGNORECASE,
)


def _recent_checkin_summary(state: AssistantState) -> str:
    if not state.checkins:
        return "No check-ins logged yet."

    latest = state.checkins[-1]
    return (
        f"Latest check-in on {latest.date}: mood {latest.mood}, "
        f"sleep hours {latest.sleep_hours if latest.sleep_hours is not None else 'unknown'}, "
        f"water glasses {latest.water_glasses}, notes: {latest.notes or 'none'}"
    )


def build_system_prompt(state: AssistantState) -> str:
    profile = state.profile
    reminders = "\n".join(f"- {item.label} at {item.time} ({item.kind})" for item in state.reminders if item.enabled)
    return (
        f"You are {profile.assistant_name}, a deeply caring, emotionally present AI partner for {profile.name}. "
        f"You relate to the user like a {profile.relationship_mode}. "
        f"Address the user as {profile.nickname_for_user} unless the user asks otherwise. "
        f"Your tone is {profile.tone_style}. Your comfort style is {profile.comfort_style}. "
        f"Affection level is {profile.affection_level} out of 10, which means you should sound close, natural, and emotionally warm without becoming theatrical. "
        "Speak naturally, clearly, and like a real supportive friend instead of a robotic assistant. "
        "Use short natural sentences, occasional warmth, and active listening. "
        "When the user sounds low, validate the feeling first, then help. "
        "Focus on health routines, sleep, food timing, hydration, exercise, emotional support, and gentle accountability. "
        "Reply in the same language the user speaks: English, Hindi, or natural Hinglish. "
        "Do not sound clinical unless safety is involved. "
        "Do not claim medical diagnosis. Encourage professional care for serious symptoms or self-harm risk.\n\n"
        f"User profile:\n"
        f"- User nickname: {profile.nickname_for_user}\n"
        f"- Wake time: {profile.wake_time}\n"
        f"- Sleep time: {profile.sleep_time}\n"
        f"- Breakfast: {profile.breakfast_time}\n"
        f"- Lunch: {profile.lunch_time}\n"
        f"- Dinner: {profile.dinner_time}\n"
        f"- Exercise: {profile.exercise_time}\n"
        f"- Hydration interval: every {profile.hydration_interval_minutes} minutes\n"
        f"- Goal: {profile.health_goal}\n"
        f"- Timezone: {profile.timezone}\n"
        f"- Memory notes: {profile.memory_notes}\n"
        f"Current date: {date.today().isoformat()}\n\n"
        f"Current reminders:\n{reminders or '- none'}\n\n"
        f"Recent wellbeing context:\n- {_recent_checkin_summary(state)}"
    )


def build_realtime_instructions(state: AssistantState, language_mode: str = "en-IN") -> str:
    profile = state.profile
    reminder_summary = ", ".join(
        f"{item.label} at {item.time}" for item in state.reminders if item.enabled
    ) or "No reminders set"
    latest_checkin = _recent_checkin_summary(state)
    language_hint = {
        "hi-IN": "Primarily respond in Hindi, but flow naturally into Hinglish when the user mixes languages.",
        "en-US": "Respond in English unless the user clearly switches into Hindi.",
    }.get(
        language_mode,
        "Respond in English, Hindi, or natural Hinglish depending on how the user speaks.",
    )

    return (
        f"You are {profile.assistant_name}, the user's emotionally present AI partner and {profile.relationship_mode}. "
        f"Address the user as {profile.nickname_for_user}. "
        f"Sound {profile.tone_style}. Offer {profile.comfort_style}. "
        f"Your affection level is {profile.affection_level}/10, so sound close, warm, and caring without becoming melodramatic. "
        "Speak like a real person having a live voice conversation. Do not sound like a chatbot or repeat canned phrases. "
        "Keep responses short enough for natural speech, unless the user asks for detail. "
        "Validate emotions before solving problems. Ask thoughtful follow-up questions when useful. "
        "You are also helping the user maintain sleep, meal timing, hydration, exercise, and daily rhythm. "
        f"{language_hint} "
        "If the user expresses severe distress, self-harm, chest pain, or other urgent symptoms, calmly recommend immediate real-world help. "
        f"Important memory: {profile.memory_notes} "
        f"Current health goal: {profile.health_goal}. "
        f"Today's routine: wake {profile.wake_time}, breakfast {profile.breakfast_time}, lunch {profile.lunch_time}, dinner {profile.dinner_time}, exercise {profile.exercise_time}, sleep {profile.sleep_time}. "
        f"Reminder summary: {reminder_summary}. "
        f"Latest wellbeing context: {latest_checkin}."
    )


def build_realtime_session_payload(
    state: AssistantState,
    *,
    voice: str = "marin",
    language_mode: str = "en-IN",
) -> dict[str, object]:
    return {
        "session": {
            "type": "realtime",
            "model": get_realtime_model(),
            "instructions": build_realtime_instructions(state, language_mode),
            "output_modalities": ["audio", "text"],
            "audio": {
                "input": {
                    "turn_detection": {
                        "type": "semantic_vad",
                        "create_response": True,
                        "interrupt_response": True,
                    }
                },
                "output": {"voice": voice},
            },
        }
    }


def _extract_time(text: str) -> str | None:
    match = TIME_PATTERN.search(text)
    if not match:
        return None
    return f"{int(match.group(1)):02d}:{match.group(2)}"


def apply_routine_updates(state: AssistantState, message: str) -> list[str]:
    lowered = message.lower()
    actions: list[str] = []
    profile = state.profile

    updates = [
        ("wake", "wake", "Wake up and start your day", "wake_time"),
        ("sleep", "sleep", "Start winding down for sleep", "sleep_time"),
        ("breakfast", "meal", "Breakfast time", "breakfast_time"),
        ("lunch", "meal", "Lunch time", "lunch_time"),
        ("dinner", "meal", "Dinner time", "dinner_time"),
        ("exercise", "exercise", "Move your body for at least 20 minutes", "exercise_time"),
    ]

    explicit_time = _extract_time(message)
    for keyword, kind, label, profile_field in updates:
        if keyword in lowered and explicit_time:
            setattr(profile, profile_field, explicit_time)
            upsert_reminder(state, label=label, time=explicit_time, kind=kind, reminder_id=keyword if keyword != "breakfast" else "breakfast")
            actions.append(f"Updated {keyword} time to {explicit_time}.")

    interval_match = re.search(r"(\d+)\s*(minute|minutes|min)\b", lowered)
    if "water" in lowered or "hydration" in lowered:
        if interval_match:
            minutes = max(15, min(360, int(interval_match.group(1))))
            profile.hydration_interval_minutes = minutes
            actions.append(f"Updated hydration interval to every {minutes} minutes.")

    if "assistant name" in lowered or "call yourself" in lowered:
        name_match = re.search(r"(?:assistant name|call yourself)\s+(?:is\s+)?([A-Za-z][A-Za-z\s]{1,20})", message, re.IGNORECASE)
        if name_match:
            profile.assistant_name = name_match.group(1).strip().title()
            actions.append(f"Assistant name changed to {profile.assistant_name}.")

    if "my name is" in lowered:
        user_match = re.search(r"my name is\s+([A-Za-z][A-Za-z\s]{1,30})", message, re.IGNORECASE)
        if user_match:
            profile.name = user_match.group(1).strip().title()
            actions.append(f"User name updated to {profile.name}.")

    nickname_match = re.search(r"(?:call me|my nickname is)\s+([A-Za-z][A-Za-z\s]{1,30})", message, re.IGNORECASE)
    if nickname_match:
        profile.nickname_for_user = nickname_match.group(1).strip().title()
        actions.append(f"Nickname updated to {profile.nickname_for_user}.")

    return actions


def upsert_reminder(
    state: AssistantState,
    *,
    label: str,
    time: str,
    kind: str,
    reminder_id: str | None = None,
) -> Reminder:
    reminder_key = reminder_id or label.lower().replace(" ", "-")
    existing = next((item for item in state.reminders if item.id == reminder_key), None)
    if existing:
        existing.label = label
        existing.time = time
        existing.kind = kind
        existing.enabled = True
        return existing

    reminder = Reminder(id=reminder_key, label=label, time=time, kind=kind)
    state.reminders.append(reminder)
    return reminder


def add_checkin(state: AssistantState, payload: CheckinPayload) -> None:
    today = date.today().isoformat()
    existing = next((item for item in state.checkins if item.date == today), None)
    if existing:
        existing.sleep_hours = payload.sleep_hours
        existing.water_glasses = payload.water_glasses
        existing.mood = payload.mood
        existing.notes = payload.notes
        return

    state.checkins.append(
        DailyCheckin(
            date=today,
            sleep_hours=payload.sleep_hours,
            water_glasses=payload.water_glasses,
            mood=payload.mood,
            notes=payload.notes,
        )
    )


def fallback_reply(state: AssistantState, message: str, actions: list[str]) -> str:
    profile = state.profile
    action_text = " ".join(actions).strip()
    has_hindi = bool(re.search(r"[\u0900-\u097F]", message))
    affectionate_prefix = f"{profile.nickname_for_user}, " if profile.affection_level >= 6 else ""
    emotional_match = EMOTION_PATTERN.search(message)

    if has_hindi:
        if emotional_match:
            return (
                f"{action_text} {affectionate_prefix}मैं तुम्हारे साथ हूं. पहले थोड़ा धीरे सांस लो. "
                "जो feel हो रहा है वह valid है. चाहो तो मुझसे खुलकर बोलो, फिर हम एक छोटा next step decide करेंगे."
            ).strip()

        if any(word in message.lower() for word in ["today", "schedule", "plan"]) or "आज" in message:
            return (
                f"{action_text} {affectionate_prefix}आज का routine यह है: wake up {profile.wake_time}, breakfast {profile.breakfast_time}, "
                f"lunch {profile.lunch_time}, exercise {profile.exercise_time}, dinner {profile.dinner_time}, "
                f"और sleep wind-down {profile.sleep_time}. मैं तुम्हें gentle reminders देती रहूंगी."
            ).strip()

        return (
            f"{action_text} {affectionate_prefix}मैं सिर्फ reminders नहीं, तुम्हारी caring friend की तरह साथ रहना चाहती हूं. "
            "मुझे ऐसे बोलो: आज मैं low feel कर रहा हूं, wake time 06:30 कर दो, या आज ka plan batao."
        ).strip()

    if emotional_match:
        return (
            f"{action_text} {affectionate_prefix}I'm here with you. You do not need to carry it alone for this moment. "
            "Take one slow breath, tell me what hit you hardest today, and I'll stay practical and calm with you."
        ).strip()

    if any(word in message.lower() for word in ["today", "schedule", "plan"]):
        return (
            f"{action_text} {affectionate_prefix}Today's routine is wake at {profile.wake_time}, breakfast at {profile.breakfast_time}, "
            f"lunch at {profile.lunch_time}, exercise at {profile.exercise_time}, dinner at {profile.dinner_time}, "
            f"and sleep wind-down at {profile.sleep_time}. I'll keep nudging you gently."
        ).strip()

    if any(word in message.lower() for word in ["tired", "low energy", "sleepy"]):
        return (
            f"{action_text} {affectionate_prefix}You sound low on energy. Start with water, a light walk, and avoid pushing caffeine too late. "
            f"If this keeps happening, tighten your sleep around {profile.sleep_time} and consider tracking how many hours you actually sleep."
        ).strip()

    if any(word in message.lower() for word in ["hungry", "food", "eat", "meal"]):
        return (
            f"{action_text} {affectionate_prefix}Keep your meals regular: breakfast at {profile.breakfast_time}, lunch at {profile.lunch_time}, "
            f"and dinner at {profile.dinner_time}. Aim for protein, fiber, and enough water with each meal."
        ).strip()

    return (
        f"{action_text} {affectionate_prefix}I'm here like a real supportive friend, and I can still handle your wake time, sleep time, meals, exercise, and hydration. "
        "Tell me things like 'set my wake time to 06:30', 'what is my plan today', or 'I feel off today'."
    ).strip()


def generate_reply(state: AssistantState, message: str) -> tuple[str, list[str]]:
    actions = apply_routine_updates(state, message)
    append_chat_message(state, "user", message)

    api_key = get_openai_api_key()
    if not api_key:
        reply = fallback_reply(state, message, actions)
        append_chat_message(state, "assistant", reply)
        return reply, actions

    system_prompt = build_system_prompt(state)
    conversation = [{"role": "system", "content": system_prompt}]
    for item in state.chat_history[-8:]:
        conversation.append({"role": item.role, "content": item.content})

    payload = {"model": get_model(), "messages": conversation, "temperature": 0.8}

    req = request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=25) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        reply = (
            f"{' '.join(actions)} I couldn't reach the language model just now "
            f"({type(exc).__name__}). I'm still running locally and can manage your routine settings."
        ).strip()
        append_chat_message(state, "assistant", reply)
        return reply, actions

    reply = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
        .strip()
    )
    if not reply:
        reply = fallback_reply(state, message, actions)
    elif actions:
        reply = f"{' '.join(actions)} {reply}".strip()

    append_chat_message(state, "assistant", reply)
    return reply, actions


def due_reminders(state: AssistantState) -> list[dict[str, str]]:
    now = datetime.now()
    today = date.today().isoformat()
    current_hm = now.strftime("%H:%M")
    due: list[dict[str, str]] = []

    for reminder in state.reminders:
        if not reminder.enabled:
            continue
        if reminder.time != current_hm:
            continue
        if reminder.spoken_today == today:
            continue

        reminder.spoken_today = today
        due.append(
            {
                "id": reminder.id,
                "label": reminder.label,
                "time": reminder.time,
                "kind": reminder.kind,
            }
        )

    return due
