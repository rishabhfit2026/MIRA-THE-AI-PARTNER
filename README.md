# MIRA The AI Partner

A local voice-first assistant that can:

- Run a live OpenAI Realtime voice conversation over WebRTC
- Feel much closer to Gemini or ChatGPT voice mode than browser speech loops
- Fall back to text chat when live voice is not connected
- Track wake, sleep, meal, hydration, and exercise routines
- Save daily health check-ins
- Store conversation history and reminders locally
- Use the OpenAI API for both text chat and live voice when `OPENAI_API_KEY` is set

## What this project is

This is a practical MVP for a personal AI partner. It is not a medical device and it does not replace a doctor. The app focuses on routine management, emotional warmth, and more natural voice interaction.

## Run it

1. Create a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set your OpenAI API key for realtime voice and text chat:

```bash
cp .env.example .env
export OPENAI_API_KEY=your_api_key_here
export OPENAI_MODEL=gpt-4.1-mini
export OPENAI_REALTIME_MODEL=gpt-realtime
```

4. Start the app:

```bash
uvicorn app.main:app --reload
```

5. Open:

```text
http://127.0.0.1:8000
```

## Voice behavior

- `Start Live Voice` creates a WebRTC session to the OpenAI Realtime API.
- Audio goes directly between Chrome and the Realtime API using an ephemeral client secret minted by your FastAPI server.
- For best support, use Chrome or Edge and allow microphone access.
- You can choose voices like `marin` and `cedar`. OpenAI currently recommends those for best quality.
- If `OPENAI_API_KEY` is missing, the live voice button will not work and the app will fall back to text chat only.

## Example things to say

- `Set my wake time to 06:30`
- `Set my sleep time to 22:45`
- `What is my plan today?`
- `Remind me to take vitamins at 09:00`
- `I feel tired today`

## Storage

The app stores data in:

- `data/assistant_state.json`

## Realtime architecture

- `POST /api/realtime/token` creates a short-lived client secret on the server
- Browser creates a WebRTC peer connection
- Browser sends SDP to `https://api.openai.com/v1/realtime/calls`
- MIRA speaks with native realtime audio instead of browser text-to-speech

## Next upgrades if you want a stronger version

- Phone notifications through WhatsApp, Telegram, or email
- Better intent extraction with structured function calling
- Calendar integration
- Wearable integration for steps and sleep
- Tool calling from the realtime session so spoken commands can directly update reminders and routines
- Calendar and messaging integrations
- Phone-first UI
