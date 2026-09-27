# FormGuide Cup (`formguide-cup`)

Source repository for Formguide Cup.

Remote: [github.com/XLander03/formguide-cup](https://github.com/XLander03/formguide-cup)

Builders Cup clickable demo: **English voice / text → AOF + KYC draft fields**.

- Confirm-before-submit · **no live bank submit**
- UI copy: **“Fields vary by bank.”** — never invent bank form IDs
- Schema: `aof_kyc_demo_v1` (working copy under `web/src/schema/`)
- Stack: Vite + React + TypeScript (Hosting) · Firebase Functions Node 20 (Gemini structured JSON)

Teammate Researcher owns `docs/schema/`, `docs/research/`, `corpus/` on GitHub — those paths are **not** created here.

## Quick start (clickable UI, no emulators)

```bash
cd web
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL.

**Works without `GEMINI_API_KEY`:**

1. Text input → **Fill from text** (client heuristic: name / DOB / PAN / mobile / address / OVD / journey)
2. Optional **Mic** (Web Speech API, `en-IN`) when the browser supports it
3. **Fill Priya Sharma demo** — synthetic PAN `ABCPS1234D` / mobile `9876543210`
4. Visible section fill: identity, contact, address, kyc_ovd, account_refs, profile_light, confirm_gates
5. Missing always-required chips + next-ask copy
6. When `demo_ready+`: **TTS read-back** (`speechSynthesis`) → tick confirm gates (or speak confirmations)
7. **Try live bank submit** → refused
8. **Emit draft (local only)** after the three acks — JSON preview, no bank POST

## Project layout

```
formguide-cup/
  README.md
  firebase.json
  .firebaserc          # placeholder project id: formguide-cup
  web/                 # Vite React Hosting target
    src/schema/        # aof_kyc_demo_v1 copies for the app
  functions/           # Firebase Functions (extract / extractLocal)
```

## Firebase Functions

```bash
cd functions
npm install
npm run build
```

Endpoints (us-central1):

| Function | Purpose |
| --- | --- |
| `extract` | Production path; binds Secret `GEMINI_API_KEY` when configured |
| `extractLocal` | Emulator-friendly; reads `process.env.GEMINI_API_KEY` only |

Request:

```http
POST /extract
Content-Type: application/json

{ "utterance": "…", "current_values": { } }
```

Response includes `field_updates`, `missing_required`, `next_ask`, `gates.answers` (choice/score/noul), `completeness`, `refuse_live_submit`, `source`.

### Set `GEMINI_API_KEY`

**Local emulator / shell:**

```bash
export GEMINI_API_KEY="your-key"
# optional: point the web app at the emulator
export VITE_FUNCTIONS_URL="http://127.0.0.1:5001/formguide-cup/us-central1"
cd web && npm run dev
```

**Deployed Functions:** set the env/secret on the function, e.g.

```bash
firebase functions:secrets:set GEMINI_API_KEY
# then bind GEMINI_API_KEY into the extract function env in Firebase console,
# or use params/defineSecret in a follow-up if you prefer Secret Manager injection.
```

If the key is missing or Gemini errors, Functions **and the browser** degrade to the same heuristic parser.

## Emulators

```bash
# from repo root — requires Firebase CLI (`npm i -g firebase-tools`)
npm install --prefix web && npm install --prefix functions
npm run build --prefix web
npm run build --prefix functions
firebase emulators:start --only hosting,functions
```

Vite already proxies `/api` → `http://127.0.0.1:5001/formguide-cup/us-central1` in dev. Hosting rewrites `/api/**` → `extract` for production.

## Deploy Hosting + Functions

1. Replace placeholder project in `.firebaserc` / `firebase use <your-project>`
2. Enable Blaze if using Secrets / outbound Gemini
3. Build & deploy:

```bash
cd web && npm ci && npm run build
cd ../functions && npm ci && npm run build
cd .. && firebase deploy --only hosting,functions
```

## Notes

- No TypeSafe / Jev live API — gates are structured JSON shaped like Choice / Score / Noul.
- Excluded from this schema: NEFT/RTGS, loans, SCSS, Form 15G/15H, nomination.
