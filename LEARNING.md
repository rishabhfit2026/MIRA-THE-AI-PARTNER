# Learning Notes

## Product Direction

MIRA should behave more like a conversational partner than a task list interface. The current implementation already supports routines and reminders, but the strongest user requirement is emotional realism in voice interaction, not just CRUD on schedules.

## Technical Learnings

- Browser-native speech APIs are the fastest MVP path for a local build.
- Continuous voice mode needs turn-taking behavior:
  stop listening while speaking, then resume automatically.
- Bilingual support in browsers is imperfect. `en-IN` is often the best default for mixed Hindi-English speech, while `hi-IN` works better for Hindi-dominant conversations.
- Local JSON persistence is enough for early development and makes iteration fast.
- If no API key is configured, fallback replies must still feel useful and not collapse the experience.

## Constraints Observed

- Web Speech API quality depends heavily on Chrome and the local operating system voices.
- Without a real-time audio model, this is still a browser-mediated voice assistant rather than full duplex voice AI.
- Natural Hindi/Hinglish responses are much stronger when backed by an LLM than with local rule-based fallback.

## Recommended Next Learnings

- Evaluate OpenAI real-time or audio-native models for lower-latency voice turns.
- Test Hindi and Hinglish recognition quality across Chrome versions and operating systems.
- Design a stronger intent extraction layer for reminder creation and schedule edits.
- Explore MCP/browser-control as a separate toolchain, not as a replacement for the user-facing product.

