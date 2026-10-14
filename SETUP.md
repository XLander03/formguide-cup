# API key setup

> **Note:** The sections below (Python/`requirements.txt`) describe an early CLI prototype that's no longer part of the app — the real app is the Node/Firebase stack in `web/` + `functions/`. Kept here for reference; see **Groq API key setup** below for the current, actually-deployed setup.

The Cup demo bar uses Gemini for the structured-JSON decision gates (route / field-complete / confirm) and field extraction. This is required per the event's stack lean — do this before starting build work.

## 1. Get a key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey) and sign in with the Google account you want tied to the project.
2. Click **Create API key** → choose or create a Google Cloud project (any project works, free-tier eligible).
3. Copy the key. Treat it like a password — never commit it, paste it into chat, or share it in Slack/Notion.

## 2. Configure it locally

```bash
cp .env.example .env
```

Open `.env` and replace the placeholder with your real key:

```
GEMINI_API_KEY=your_actual_key_here
```

`.env` is already listed in `.gitignore` — it will not be committed. Never remove that line.

## 3. Install the SDK

SDK deps are pinned in [`requirements.txt`](requirements.txt) (`google-genai`, `python-dotenv`):

```bash
pip install -r requirements.txt
```

## 4. Load it in code

```python
from dotenv import load_dotenv
from google import genai
import os

load_dotenv()
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
```

## 5. Deploying (Cloud Run / Firebase)

Don't bake the key into the image or repo. Use a runtime secret instead:

```bash
gcloud secrets create gemini-api-key --data-file=- <<< "your_actual_key_here"
gcloud run deploy formguide-cup --set-secrets=GEMINI_API_KEY=gemini-api-key:latest
```

Firebase Functions equivalent:
```bash
firebase functions:secrets:set GEMINI_API_KEY
```

## Checklist

- [ ] Key created in AI Studio
- [ ] `.env` created locally from `.env.example` (not committed)
- [ ] SDK installed via `pip install -r requirements.txt`
- [ ] Key loads successfully in a local test call
- [ ] Deployment uses a secret manager, not a hardcoded key

---

# Groq API key setup (STT fallback)

`functions/src/index.ts`'s `speak` function transcribes audio with Gemini first. If that upload/transcribe call fails for any reason (rate limit, outage, bad response), it falls back to **Groq's `whisper-large-v3`** instead of failing the request outright. This is optional — if `GROQ_API_KEY` isn't set, behavior is unchanged from before (Gemini failure just fails the request, same as always).

## 1. Get a key

1. Go to [console.groq.com/keys](https://console.groq.com/keys) and sign in.
2. Click **Create API Key**, name it (e.g. `formguide-cup-stt-fallback`), copy it.
3. Treat it like a password — never commit it, paste it into chat, or share it in Slack/Notion.

## 2. Set it as a Firebase secret

The function reads this via `defineSecret('GROQ_API_KEY')`, same pattern as `GEMINI_API_KEY` — it must exist in Secret Manager before you deploy, or the deploy will fail referencing a secret that doesn't exist yet:

```bash
cd functions
npx firebase-tools functions:secrets:set GROQ_API_KEY --project faceapp-5397b
```

This prompts for the key value directly in your terminal (hidden input, not echoed).

## 3. Deploy functions so it picks up the secret

```bash
npx firebase-tools deploy --only functions --project faceapp-5397b
```

## Local / emulator testing

Export it the same way as `GEMINI_API_KEY` before starting the emulator:

```bash
export GROQ_API_KEY="your-groq-key-here"
```

## Checklist

- [ ] Key created at console.groq.com
- [ ] Set via `functions:secrets:set GROQ_API_KEY` (not committed, not in `.env`)
- [ ] Functions redeployed after setting the secret
- [ ] Confirmed via a Gemini-outage test (or reading function logs for `gemini_transcribe_failed_falling_back_to_groq`) that the fallback actually fires
