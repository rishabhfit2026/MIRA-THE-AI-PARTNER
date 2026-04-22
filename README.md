# Health Voice Assistant

A local voice-first assistant that can:

- Talk back using your browser voice
- Listen using browser speech recognition
- Track wake, sleep, meal, hydration, and exercise routines
- Save daily health check-ins
- Store conversation history and reminders locally
- Use the OpenAI Responses API for more natural conversation when `OPENAI_API_KEY` is set

## What this project is

This is a practical MVP for a personal AI assistant. It is not a medical device and it does not replace a doctor. The app focuses on routine management and friendly accountability.

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

3. Optionally set your API key:

```bash
cp .env.example .env
export OPENAI_API_KEY=your_api_key_here
export OPENAI_MODEL=gpt-4.1-mini
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

- Microphone input uses the browser Web Speech API.
- Spoken replies use browser speech synthesis.
- For best voice-input support, use Chrome or Edge.

## Example things to say

- `Set my wake time to 06:30`
- `Set my sleep time to 22:45`
- `What is my plan today?`
- `Remind me to take vitamins at 09:00`
- `I feel tired today`

## Storage

The app stores data in:

- `data/assistant_state.json`

## Next upgrades if you want a stronger version

- Phone notifications through WhatsApp, Telegram, or email
- Better intent extraction with structured function calling
- Calendar integration
- Wearable integration for steps and sleep
- Real streaming voice with OpenAI audio models
