const state = {
  current: null,
  lastReply: "",
  recognition: null,
  listening: false,
  voiceMode: false,
  speaking: false,
  manualStop: false,
  queuedTranscript: "",
  transcriptTimer: null,
  selectedLanguage: "en-IN",
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
const micButton = document.getElementById("micButton");
const voiceModeButton = document.getElementById("voiceModeButton");
const speakLastButton = document.getElementById("speakLastButton");
const stopSpeakButton = document.getElementById("stopSpeakButton");
const assistantTitle = document.getElementById("assistant-title");
const languageMode = document.getElementById("languageMode");

function renderMessage(role, content) {
  const item = document.createElement("div");
  item.className = `message ${role}`;
  item.textContent = content;
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
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
      chip.textContent = `${item.time}  ${item.label} (${item.kind})`;
      reminderList.appendChild(chip);
    });

  const planItems = [
    `Wake at ${appState.profile.wake_time}`,
    `Breakfast at ${appState.profile.breakfast_time}`,
    `Lunch at ${appState.profile.lunch_time}`,
    `Exercise at ${appState.profile.exercise_time}`,
    `Dinner at ${appState.profile.dinner_time}`,
    `Sleep by ${appState.profile.sleep_time}`,
  ];
  planItems.forEach((text) => {
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
  voiceModeButton.textContent = state.voiceMode ? "Stop Voice Mode" : "Start Voice Mode";
  voiceModeButton.classList.toggle("active", state.voiceMode);
  micButton.disabled = state.voiceMode;
}

function applyRecognitionLanguage() {
  state.selectedLanguage = languageMode.value;
  if (state.recognition) {
    state.recognition.lang = state.selectedLanguage;
  }
}

function clearTranscriptTimer() {
  if (!state.transcriptTimer) {
    return;
  }
  window.clearTimeout(state.transcriptTimer);
  state.transcriptTimer = null;
}

function scheduleQueuedTranscript() {
  clearTranscriptTimer();
  state.transcriptTimer = window.setTimeout(async () => {
    const content = state.queuedTranscript.trim();
    state.queuedTranscript = "";
    if (!content) {
      return;
    }
    chatInput.value = content;
    await sendMessage(content);
  }, 900);
}

function pickVoice(text) {
  const voices = window.speechSynthesis.getVoices();
  const wantHindi = /[\u0900-\u097F]/.test(text) || state.selectedLanguage === "hi-IN";

  if (wantHindi) {
    return (
      voices.find((voice) => /hi[-_]?IN|hindi/i.test(voice.lang) || /hindi/i.test(voice.name)) ||
      voices.find((voice) => /india/i.test(voice.name))
    );
  }

  return (
    voices.find((voice) =>
      /en[-_]?IN/i.test(voice.lang) || /india|female|zira|samantha|google uk english female/i.test(voice.name)
    ) ||
    voices.find((voice) => /en/i.test(voice.lang))
  );
}

function startRecognition() {
  if (!state.recognition || state.listening || state.speaking) {
    return;
  }

  applyRecognitionLanguage();
  state.manualStop = false;
  try {
    state.recognition.start();
  } catch (error) {
    if (!String(error).includes("start")) {
      console.error(error);
    }
  }
}

function stopRecognition(manual = false) {
  if (!state.recognition || !state.listening) {
    state.manualStop = manual;
    return;
  }

  state.manualStop = manual;
  state.recognition.stop();
}

function startVoiceMode() {
  state.voiceMode = true;
  state.queuedTranscript = "";
  clearTranscriptTimer();
  updateVoiceButtons();
  updateStatus("Voice mode is on. Speak in English, Hindi, or mixed Hinglish.");
  startRecognition();
}

function stopVoiceMode() {
  state.voiceMode = false;
  state.queuedTranscript = "";
  clearTranscriptTimer();
  stopRecognition(true);
  updateVoiceButtons();
  updateStatus("Voice mode stopped.");
}

function speak(text) {
  if (!text) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const chosenVoice = pickVoice(text);

  if (chosenVoice) {
    utterance.voice = chosenVoice;
    utterance.lang = chosenVoice.lang;
  } else {
    utterance.lang = state.selectedLanguage;
  }

  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.onstart = () => {
    state.speaking = true;
    if (state.voiceMode) {
      stopRecognition(false);
      updateStatus("Speaking. I will listen again when I finish.");
    }
  };
  utterance.onend = () => {
    state.speaking = false;
    if (state.voiceMode) {
      updateStatus("Voice mode is on. I am listening again.");
      window.setTimeout(() => startRecognition(), 250);
    } else {
      updateStatus("Microphone idle.");
    }
  };

  window.speechSynthesis.speak(utterance);
}

function setupVoiceRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    updateStatus("This browser does not support Web Speech recognition. Use Chrome.");
    micButton.disabled = true;
    voiceModeButton.disabled = true;
    return;
  }

  const recognition = new Recognition();
  recognition.lang = state.selectedLanguage;
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    state.listening = true;
    updateStatus(`Listening in ${languageMode.options[languageMode.selectedIndex].text}. Speak naturally.`);
  };

  recognition.onend = () => {
    state.listening = false;
    if (state.voiceMode && !state.speaking && !state.manualStop) {
      updateStatus("Reconnecting voice mode...");
      window.setTimeout(() => startRecognition(), 250);
      return;
    }

    if (!state.voiceMode) {
      updateStatus("Microphone idle.");
    }
  };

  recognition.onerror = (event) => {
    if (event.error === "no-speech") {
      if (!state.voiceMode) {
        updateStatus("I did not hear anything. Try again.");
      }
      return;
    }

    if (event.error === "aborted") {
      return;
    }

    updateStatus(`Voice input error: ${event.error}`);
  };

  recognition.onresult = (event) => {
    let finalTranscript = "";
    let interimTranscript = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript.trim();
      if (!transcript) {
        continue;
      }

      if (event.results[index].isFinal) {
        finalTranscript += ` ${transcript}`;
      } else {
        interimTranscript += ` ${transcript}`;
      }
    }

    const preview = `${state.queuedTranscript} ${interimTranscript}`.trim();
    if (preview) {
      chatInput.value = preview;
    }

    if (finalTranscript.trim()) {
      state.queuedTranscript = `${state.queuedTranscript} ${finalTranscript}`.trim();
      scheduleQueuedTranscript();
    }
  };

  state.recognition = recognition;
}

async function sendMessage(message) {
  const content = (message || chatInput.value).trim();
  if (!content) {
    return;
  }

  clearTranscriptTimer();
  state.queuedTranscript = "";
  chatInput.value = "";
  renderMessage("user", content);
  updateStatus("Thinking about your reply...");

  const data = await getJson("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: content }),
  });

  state.lastReply = data.reply;
  renderState(data.state);
  speak(data.reply);
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
  const updated = await getJson("/api/profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  renderState(updated);
  const reply = "Your routine has been updated. I will use this schedule for your reminders.";
  state.lastReply = reply;
  renderMessage("assistant", reply);
  speak(reply);
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
  const reply = "Check-in saved. I will remember that in the next conversation.";
  state.lastReply = reply;
  renderMessage("assistant", reply);
  speak(reply);
});

voiceModeButton.addEventListener("click", () => {
  if (!state.recognition) {
    return;
  }

  if (state.voiceMode) {
    stopVoiceMode();
    return;
  }

  startVoiceMode();
});

micButton.addEventListener("click", () => {
  if (!state.recognition || state.voiceMode) {
    return;
  }

  if (state.listening) {
    stopRecognition(true);
    return;
  }

  startRecognition();
});

languageMode.addEventListener("change", () => {
  applyRecognitionLanguage();
  if (state.voiceMode) {
    stopRecognition(false);
    window.setTimeout(() => startRecognition(), 250);
  }
});

speakLastButton.addEventListener("click", () => speak(state.lastReply));
stopSpeakButton.addEventListener("click", () => {
  window.speechSynthesis.cancel();
  state.speaking = false;
  if (state.voiceMode) {
    window.setTimeout(() => startRecognition(), 200);
  }
});

async function pollReminders() {
  try {
    const data = await getJson("/api/reminders/due");
    if (!data.items || !data.items.length) {
      return;
    }

    data.items.forEach((item) => {
      const message = `${state.current.profile.name}, ${item.label}.`;
      renderMessage("assistant", message);
      speak(message);
      state.lastReply = message;
    });
  } catch (error) {
    console.error(error);
  }
}

async function bootstrap() {
  setupVoiceRecognition();
  updateVoiceButtons();

  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }

  const appState = await getJson("/api/state");
  renderState(appState);

  if (!appState.chat_history.length) {
    const intro = `Hi ${appState.profile.name}, I am ${appState.profile.assistant_name}. Start voice mode and talk to me in English, Hindi, or Hinglish.`;
    renderMessage("assistant", intro);
    state.lastReply = intro;
  }

  setInterval(pollReminders, 30000);
}

bootstrap().catch((error) => {
  updateStatus(`Startup failed: ${error.message}`);
});
