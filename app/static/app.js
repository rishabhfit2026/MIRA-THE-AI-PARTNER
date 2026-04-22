const state = {
  current: null,
  lastReply: "",
  realtime: {
    connected: false,
    connecting: false,
    pc: null,
    dc: null,
    stream: null,
    audioEl: null,
  },
  draftMessages: new Map(),
};

const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const profileForm = document.getElementById("profileForm");
const reminderForm = document.getElementById("reminderForm");
const checkinForm = document.getElementById("checkinForm");
const reminderList = document.getElementById("reminderList");
const checkinSummary = document.getElementById("checkinSummary");
const todayPlan = document.getElementById("todayPlan");
const statusLine = document.getElementById("statusLine");
const voiceModeButton = document.getElementById("voiceModeButton");
const speakLastButton = document.getElementById("speakLastButton");
const stopSpeakButton = document.getElementById("stopSpeakButton");
const assistantTitle = document.getElementById("assistant-title");
const languageMode = document.getElementById("languageMode");
const voiceSelect = document.getElementById("voiceSelect");

function renderMessage(role, content) {
  const item = document.createElement("div");
  item.className = `message ${role}`;
  item.textContent = content;
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
  return item;
}

function upsertDraftMessage(key, role, content) {
  if (!content) {
    return;
  }

  let item = state.draftMessages.get(key);
  if (!item) {
    item = document.createElement("div");
    item.className = `message ${role}`;
    item.dataset.draft = key;
    chatLog.appendChild(item);
    state.draftMessages.set(key, item);
  }

  item.textContent = content;
  chatLog.scrollTop = chatLog.scrollHeight;
}

function finalizeDraftMessage(key, role, content) {
  const item = state.draftMessages.get(key);
  if (item) {
    item.className = `message ${role}`;
    item.removeAttribute("data-draft");
    item.textContent = content || item.textContent;
    state.draftMessages.delete(key);
    chatLog.scrollTop = chatLog.scrollHeight;
    return;
  }

  if (content) {
    renderMessage(role, content);
  }
}

function removeDraftMessage(key) {
  const item = state.draftMessages.get(key);
  if (!item) {
    return;
  }

  item.remove();
  state.draftMessages.delete(key);
}

function fillProfile(profile) {
  assistantTitle.textContent = profile.assistant_name;
  for (const [key, value] of Object.entries(profile)) {
    const field = profileForm.elements.namedItem(key);
    if (field) {
      field.value = value;
    }
  }
}

function renderState(appState) {
  state.current = appState;
  fillProfile(appState.profile);
  reminderList.innerHTML = "";
  todayPlan.innerHTML = "";
  checkinSummary.innerHTML = "";
  chatLog.innerHTML = "";
  state.draftMessages.clear();

  appState.chat_history.forEach((msg) => {
    if (msg.role !== "system") {
      renderMessage(msg.role, msg.content);
    }
  });

  appState.reminders
    .filter((item) => item.enabled)
    .sort((a, b) => a.time.localeCompare(b.time))
    .forEach((item) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = `${item.time} ${item.label} (${item.kind})`;
      reminderList.appendChild(chip);
    });

  [
    `Wake at ${appState.profile.wake_time}`,
    `Breakfast at ${appState.profile.breakfast_time}`,
    `Lunch at ${appState.profile.lunch_time}`,
    `Exercise at ${appState.profile.exercise_time}`,
    `Dinner at ${appState.profile.dinner_time}`,
    `Sleep by ${appState.profile.sleep_time}`,
  ].forEach((text) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = text;
    todayPlan.appendChild(chip);
  });

  const latestCheckin = appState.checkins[appState.checkins.length - 1];
  if (latestCheckin) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = `${latestCheckin.date}: mood ${latestCheckin.mood}, water ${latestCheckin.water_glasses} glasses, sleep ${latestCheckin.sleep_hours ?? "n/a"} hours.`;
    checkinSummary.appendChild(chip);
  }
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with ${response.status}`);
  }
  return response.json();
}

function updateStatus(text) {
  statusLine.textContent = text;
}

function updateVoiceButtons() {
  if (state.realtime.connected) {
    voiceModeButton.textContent = "Live Voice Connected";
    voiceModeButton.classList.add("active");
    stopSpeakButton.disabled = false;
    speakLastButton.disabled = false;
    return;
  }

  if (state.realtime.connecting) {
    voiceModeButton.textContent = "Connecting...";
    voiceModeButton.classList.add("active");
    stopSpeakButton.disabled = true;
    speakLastButton.disabled = true;
    return;
  }

  voiceModeButton.textContent = "Start Live Voice";
  voiceModeButton.classList.remove("active");
  stopSpeakButton.disabled = true;
  speakLastButton.disabled = true;
}

function closeRealtimeResources() {
  const { dc, pc, stream, audioEl } = state.realtime;

  if (dc) {
    dc.close();
  }

  if (pc) {
    pc.getSenders().forEach((sender) => sender.track?.stop());
    pc.close();
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  if (audioEl) {
    audioEl.pause();
    audioEl.srcObject = null;
  }

  state.realtime = {
    connected: false,
    connecting: false,
    pc: null,
    dc: null,
    stream: null,
    audioEl: null,
  };
  updateVoiceButtons();
}

function stopRealtimeSession(reason = "Live voice disconnected.") {
  closeRealtimeResources();
  updateStatus(reason);
}

function getEventText(event) {
  if (typeof event.transcript === "string" && event.transcript.trim()) {
    return event.transcript.trim();
  }
  if (typeof event.delta === "string" && event.delta.trim()) {
    return event.delta;
  }
  if (typeof event.text === "string" && event.text.trim()) {
    return event.text;
  }
  if (typeof event?.item?.formatted?.transcript === "string" && event.item.formatted.transcript.trim()) {
    return event.item.formatted.transcript.trim();
  }
  if (typeof event?.response?.output_text === "string" && event.response.output_text.trim()) {
    return event.response.output_text.trim();
  }
  return "";
}

function appendAssistantDelta(text) {
  if (!text) {
    return;
  }
  state.lastReply = `${state.lastReply}${text}`;
  upsertDraftMessage("assistant-live", "assistant", state.lastReply);
}

function handleRealtimeEvent(event) {
  switch (event.type) {
    case "session.created":
    case "session.updated":
      updateStatus("Live voice connected. Talk normally and interrupt naturally.");
      break;
    case "input_audio_buffer.speech_started":
      removeDraftMessage("user-live");
      updateStatus("I am listening...");
      break;
    case "input_audio_buffer.speech_stopped":
      updateStatus("I heard you. Let me respond.");
      break;
    case "conversation.item.input_audio_transcription.completed": {
      const transcript = getEventText(event);
      if (transcript) {
        finalizeDraftMessage("user-live", "user", transcript);
      }
      break;
    }
    case "conversation.item.input_audio_transcription.delta": {
      const delta = getEventText(event);
      if (delta) {
        const current = state.draftMessages.get("user-live")?.textContent || "";
        upsertDraftMessage("user-live", "user", `${current}${delta}`.trim());
      }
      break;
    }
    case "response.audio_transcript.delta":
    case "response.text.delta":
    case "response.output_text.delta": {
      appendAssistantDelta(getEventText(event));
      break;
    }
    case "response.audio_transcript.done":
    case "response.text.done":
    case "response.output_text.done": {
      const doneText = getEventText(event) || state.lastReply;
      if (doneText) {
        state.lastReply = doneText;
        finalizeDraftMessage("assistant-live", "assistant", doneText);
      }
      break;
    }
    case "response.done":
      if (state.lastReply) {
        finalizeDraftMessage("assistant-live", "assistant", state.lastReply);
      }
      updateStatus("Live voice connected. Keep talking.");
      break;
    case "error":
      updateStatus(`Realtime error: ${event.error?.message || "unknown error"}`);
      break;
    default:
      break;
  }
}

function setupDataChannel(dc) {
  dc.addEventListener("open", () => {
    state.realtime.connected = true;
    state.realtime.connecting = false;
    updateVoiceButtons();
    updateStatus("Live voice connected. Talk normally and interrupt naturally.");
  });

  dc.addEventListener("close", () => {
    if (state.realtime.connected || state.realtime.connecting) {
      stopRealtimeSession("Live voice session ended.");
    }
  });

  dc.addEventListener("message", (messageEvent) => {
    try {
      const event = JSON.parse(messageEvent.data);
      handleRealtimeEvent(event);
    } catch (error) {
      console.error("Realtime event parse failed", error);
    }
  });
}

async function startRealtimeSession() {
  if (state.realtime.connected || state.realtime.connecting) {
    return;
  }

  state.realtime.connecting = true;
  updateVoiceButtons();
  updateStatus("Creating secure live voice session...");

  try {
    const tokenData = await getJson("/api/realtime/token", {
      method: "POST",
      body: JSON.stringify({
        voice: voiceSelect.value,
        language_mode: languageMode.value,
      }),
    });

    const ephemeralKey = tokenData.value;
    if (!ephemeralKey) {
      throw new Error("Realtime token response did not include a client secret.");
    }

    const pc = new RTCPeerConnection();
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    pc.ontrack = (event) => {
      audioEl.srcObject = event.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        updateStatus("Live voice connected. Talk normally and interrupt naturally.");
      }
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        stopRealtimeSession(`Live voice ${pc.connectionState}.`);
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const dc = pc.createDataChannel("oai-events");
    setupDataChannel(dc);

    state.realtime = {
      connected: false,
      connecting: true,
      pc,
      dc,
      stream,
      audioEl,
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpResponse.ok) {
      throw new Error(await sdpResponse.text());
    }

    await pc.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text(),
    });
  } catch (error) {
    console.error(error);
    stopRealtimeSession(`Live voice failed: ${error.message}`);
  }
}

function sendRealtimeTextMessage(text) {
  if (!state.realtime.connected || !state.realtime.dc) {
    throw new Error("Live voice is not connected.");
  }

  state.lastReply = "";
  state.realtime.dc.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    }),
  );
  state.realtime.dc.send(
    JSON.stringify({
      type: "response.create",
      response: {
        output_modalities: ["audio", "text"],
      },
    }),
  );
}

async function sendMessage(message) {
  const content = (message || chatInput.value).trim();
  if (!content) {
    return;
  }

  chatInput.value = "";
  renderMessage("user", content);

  if (state.realtime.connected) {
    state.lastReply = "";
    updateStatus("Sending typed prompt into live voice...");
    sendRealtimeTextMessage(content);
    return;
  }

  updateStatus("Live voice is not connected, so this uses the fallback text assistant.");
  const data = await getJson("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: content }),
  });

  state.lastReply = data.reply;
  renderState(data.state);
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendMessage();
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(profileForm);
  const payload = Object.fromEntries(formData.entries());
  payload.hydration_interval_minutes = Number(payload.hydration_interval_minutes);
  payload.affection_level = Number(payload.affection_level);
  const updated = await getJson("/api/profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  renderState(updated);
  renderMessage(
    "assistant",
    `I updated how I show up for you, ${updated.profile.nickname_for_user}. Reconnect live voice if you want the new tone immediately.`,
  );
  if (state.realtime.connected) {
    updateStatus("Profile saved. End and restart live voice to apply the new personality instantly.");
  }
});

reminderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(reminderForm).entries());
  const updated = await getJson("/api/reminders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  renderState(updated);
  reminderForm.reset();
});

checkinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(checkinForm).entries());
  payload.sleep_hours = payload.sleep_hours ? Number(payload.sleep_hours) : null;
  payload.water_glasses = Number(payload.water_glasses);
  const updated = await getJson("/api/checkin", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  renderState(updated);
  renderMessage("assistant", "Check-in saved. Restart live voice if you want MIRA to use that context right away.");
});

voiceModeButton.addEventListener("click", async () => {
  if (state.realtime.connected || state.realtime.connecting) {
    return;
  }
  await startRealtimeSession();
});

speakLastButton.addEventListener("click", async () => {
  if (!chatInput.value.trim()) {
    updateStatus("Type something in the input box first.");
    return;
  }
  await sendMessage(chatInput.value);
});

stopSpeakButton.addEventListener("click", () => {
  stopRealtimeSession("Live voice disconnected.");
});

async function pollReminders() {
  try {
    const data = await getJson("/api/reminders/due");
    if (!data.items || !data.items.length) {
      return;
    }

    data.items.forEach((item) => {
      renderMessage("assistant", `${state.current.profile.nickname_for_user}, ${item.label}.`);
    });
  } catch (error) {
    console.error(error);
  }
}

async function bootstrap() {
  updateVoiceButtons();

  const appState = await getJson("/api/state");
  renderState(appState);

  if (!appState.chat_history.length) {
    renderMessage(
      "assistant",
      `Hi ${appState.profile.nickname_for_user}. Start Live Voice to talk with me using OpenAI Realtime voice instead of browser speech.`,
    );
  }

  setInterval(pollReminders, 30000);
}

bootstrap().catch((error) => {
  updateStatus(`Startup failed: ${error.message}`);
});
