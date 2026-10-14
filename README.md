# FormGuide Cup (`formguide-cup`)

Source repository for Formguide Cup.

Remote: [github.com/XLander03/formguide-cup](https://github.com/XLander03/formguide-cup)

## Setup

See [SETUP.md](SETUP.md) for setting up the Gemini API key before starting build work.

Builders Cup clickable demo: **Hindi + English voice / text → AOF + KYC draft fields**. Regional languages come later.

- Confirm-before-submit · **no live bank submit**
- UI copy: **“Fields vary by bank.”** — never invent bank form IDs
- Schema: `aof_kyc_demo_v1` (working copy under `web/src/schema/`)
- Stack: Vite + React + TypeScript (Hosting) · Firebase Functions Node 20 (`speak`: Gemini transcription + structured JSON)

Teammate Researcher owns `docs/schema/`, `docs/research/`, and `corpus/`. This app does not modify those paths.

## Quick start (clickable UI, no emulators)

```bash
cd web
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL.

**Demo flow:**

1. Text input → **Fill from text** (client heuristic: name / DOB / PAN / mobile / address / OVD / journey)
2. **Mic** (`en-IN` or `hi-IN`) records a clip and sends it to the `speak` function for Gemini transcription and field fill. Missing prompts and TTS read-back follow the utterance language (Hindi, English, or mixed).
3. **Fill Priya Sharma demo** — synthetic PAN `ABCPS1234D` / mobile `9876543210`
4. Visible section fill: identity, contact, address, kyc_ovd, account_refs, profile_light, confirm_gates
5. Missing always-required chips + next-ask copy
6. When `demo_ready+` and no field is flagged: **Read back** (`speechSynthesis`) → tick confirm gates (or speak confirmations)
7. **Save draft only** after the three acks — JSON preview on this device. Nothing is submitted to a bank.

## Project layout

```
formguide-cup/
  README.md
  firebase.json        # Hosting web/dist, /api/speak -> speak function
  .firebaserc          # Firebase project faceapp-5397b
  web/                 # Vite React Hosting target
    src/schema/        # aof_kyc_demo_v1 copies for the app
  functions/           # Cloud Function `speak` (Gemini transcription + field JSON)
```

## Live deployment

- App: [faceapp-5397b.web.app](https://faceapp-5397b.web.app) (Firebase project `faceapp-5397b`, Blaze)
- Hosting serves `web/dist`. `/api/speak` rewrites to the `speak` function in `us-central1`; every other path serves `index.html`.

## Cloud Function `speak`

The mic records a WAV clip in the browser and posts it as multipart form data:

```http
POST /api/speak
Content-Type: multipart/form-data

language=en-IN | hi-IN
current_values={...}   (JSON)
audio=clip.wav
```

The function uploads the clip to the Gemini Files API, transcribes it with `gemini-3.5-transcribe`, extracts `aof_kyc_demo_v1` fields with `gemini-3.5-flash-lite`, then deletes the upload. The response includes `transcript`, `field_updates`, `missing_required`, `next_ask`, `reply_lang`, `completeness`, and `refuse_live_submit`. The browser reads `next_ask` back with speech synthesis.

Typed text does not call Gemini. **Fill from text** uses the client heuristic (`/api/extract` in Vite dev, otherwise in-browser).

### `GEMINI_API_KEY`

The key lives only in the Firebase secret bound to `speak`:

```bash
npx firebase-tools functions:secrets:set GEMINI_API_KEY
```

Never put it in the repo or the web build.

## Local dev

`npm run dev` serves `/api/extract` from a Vite middleware and proxies `/api/speak` to the deployed function on `faceapp-5397b.web.app`, so the mic uses real Gemini without a local key.

## Deploy Hosting + Functions

Requires `npx firebase-tools login` with an account that has access to `faceapp-5397b`.

```bash
npm ci --prefix web && npm ci --prefix functions
npm run deploy   # builds web/dist, then firebase deploy --only hosting,functions
```

The functions predeploy hook runs `tsc`. Deploy only `hosting,functions`; the project's Realtime Database and Storage are not owned by this app.

## Notes

- No TypeSafe / Jev live API — gates are structured JSON shaped like Choice / Score / Noul.
- Excluded from this schema: NEFT/RTGS, loans, SCSS, Form 15G/15H, nomination.
