# Gemini API key setup

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
