from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


ReminderType = Literal["wake", "meal", "sleep", "medicine", "hydration", "exercise", "custom"]


class AssistantProfile(BaseModel):
    name: str = "Rishabh"
    assistant_name: str = "Mira"
    voice: str = "Google UK English Female"
    wake_time: str = "07:00"
    sleep_time: str = "23:00"
    breakfast_time: str = "08:30"
    lunch_time: str = "13:30"
    dinner_time: str = "20:30"
    hydration_interval_minutes: int = 120
    exercise_time: str = "18:30"
    health_goal: str = "Stay consistent with sleep, meals, hydration, and general energy."
    timezone: str = "Asia/Kolkata"


class Reminder(BaseModel):
    id: str
    label: str
    time: str
    kind: ReminderType = "custom"
    enabled: bool = True
    spoken_today: str | None = None


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str
    created_at: str


class DailyCheckin(BaseModel):
    date: str = Field(default_factory=lambda: date.today().isoformat())
    sleep_hours: float | None = None
    water_glasses: int = 0
    mood: str = "okay"
    notes: str = ""


class AssistantState(BaseModel):
    profile: AssistantProfile = Field(default_factory=AssistantProfile)
    reminders: list[Reminder] = Field(default_factory=list)
    chat_history: list[ChatMessage] = Field(default_factory=list)
    checkins: list[DailyCheckin] = Field(default_factory=list)


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    state: AssistantState
    actions: list[str] = Field(default_factory=list)


class ProfileUpdate(BaseModel):
    name: str
    assistant_name: str
    wake_time: str
    sleep_time: str
    breakfast_time: str
    lunch_time: str
    dinner_time: str
    hydration_interval_minutes: int
    exercise_time: str
    health_goal: str
    timezone: str


class ReminderPayload(BaseModel):
    label: str
    time: str
    kind: ReminderType = "custom"
    enabled: bool = True


class CheckinPayload(BaseModel):
    sleep_hours: float | None = None
    water_glasses: int = 0
    mood: str = "okay"
    notes: str = ""

