# Setup

This covers everything from a fresh clone to a deployed app: running locally, keys and secrets, Google Cloud and Firebase configuration, admin accounts, deploying, and checking that it works.

The production Firebase project is **`faceapp-5397b`** (set in `.firebaserc`). Commands below assume it.

## 1. Prerequisites

- **Node.js 22** (the functions run on Node 22; newer versions work locally)
- **npm**
- **Firebase CLI**: commands use `npx firebase-tools`, so no global install is needed
- A Google account with access to the Firebase project, for deploying and setting secrets
- **Optional:** the `gcloud` CLI, for enabling Cloud APIs

## 2. Install

```bash
git clone https://github.com/XLander03/formguide-cup.git
cd formguide-cup
npm ci --prefix web
npm ci --prefix functions
```

## 3. Run the web app locally

```bash
npm run dev                # serves web/ at http://localhost:5173
```

Local dev needs no keys. The Vite dev server (`web/vite.config.ts`):

- Serves `/api/extract` itself, for the typed-text fallback.
- Proxies the other `/api/*` endpoints to the deployed app at `faceapp-5397b.web.app`. Voice, speech, the planner and published forms therefore use the real deployed functions, and count against their rate limits.

Useful URL switches:

| URL | What it does |
| --- | --- |
| `/speak?demo=1` | Shows the demo helpers (sample phrase, sample draft, manual read-back) for that tab. `?demo=0` hides them. |
| `/speak?flags=1` | Loads the sample draft with two low-confidence fields, to show "Check this" |
| `/admin?mock=1` | Admin console, upload and copilot with in-browser mock data and no backend |

**Known gap:** the dev proxy has no entry for `/api/adminCopilot`, so the real copilot fails under `npm run dev`. Use `?mock=1`, or test the copilot on the deployed app.

### Admin sign-in locally

The admin console signs in with Firebase Auth, which needs the Firebase web config at build time. Create `web/.env` (git-ignored):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_AUTH_DOMAIN=faceapp-5397b.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=faceapp-5397b
```

Get the values from Firebase console → Project settings → Your apps → Web app. These are public identifiers, not secrets, but they stay out of git.

**`web/.env` must also exist when you build for deploy.** A build without it ships an admin console that cannot sign in.

## 4. Keys and secrets

Production keys live in **Firebase Secret Manager**, never in the repo or the web build.

| Secret | Required | Used by | Get it from |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes | `speak`, `tts`, `planJourney`, `ingestForm`, `adminCopilot` | [Google AI Studio](https://aistudio.google.com/apikey) |
| `GROQ_API_KEY` | Must exist (can be a placeholder) | `speak`: Whisper fallback when Gemini transcription fails | [console.groq.com/keys](https://console.groq.com/keys) |

```bash
npx firebase-tools functions:secrets:set GEMINI_API_KEY --project faceapp-5397b
npx firebase-tools functions:secrets:set GROQ_API_KEY  --project faceapp-5397b
```

Each command prompts for the value with hidden input. `speak` declares both secrets, so **a deploy fails if either one does not exist** in Secret Manager. If you don't use Groq, store any placeholder value; when Gemini transcription fails, the fallback is then tried and simply fails too.

**Gemini quota matters.** Each voice turn uses transcription and a field-extraction call, and backup speech uses Gemini text-to-speech models whose preview quotas are small. On a free-tier key, transcription is capped at about 25 requests a day. Use a billed key for anything beyond a quick test, and watch usage at [ai.dev/rate-limit](https://ai.dev/rate-limit).

**Optional function environment variable:** `TTS_DAILY_CHAR_CAP` (default `300000`) caps Cloud Text-to-Speech characters per UTC day across all users. To change it, set it in `functions/.env` before deploying.

For local scripts only, a root `.env` (copied from `.env.example`) can hold `GEMINI_API_KEY` and `GROQ_API_KEY`. The deployed app never reads it.

## 5. Google Cloud and Firebase configuration

All of this lives in project `faceapp-5397b`.

1. **Blaze plan.** Cloud Functions 2nd gen requires it.
2. **Firestore database `formguide`, in Native mode.** The project's `(default)` database is in Datastore mode and cannot store these documents, so the code always uses the named database `formguide`. It holds forms, rate-limit counters and usage insights.
3. **Cloud Storage default bucket.** It holds uploaded source PDFs and page images under `forms/{formId}/versions/{version}/`.
4. **Firebase Authentication with Email/Password enabled.** Only admins sign in; customers never do.
5. **Cloud APIs** for speech:
   ```bash
   gcloud services enable texttospeech.googleapis.com speech.googleapis.com --project faceapp-5397b
   ```
   - **Cloud Text-to-Speech** (Chirp 3 HD voices) speaks Hindi and the regional languages. The first 1M characters a month are free.
   - **Cloud Speech-to-Text v2** (Chirp 3, `us` location) transcribes the regional languages and detects the spoken language.

   Both are called with the functions' own service account, so there's no key to manage. That account needs permission to use them; the default compute service account usually has it. If either API is off, the code falls back to Gemini, and logs show `SERVICE_DISABLED`.
6. **Hosting sites.** `firebase.json` deploys the same build to two sites, `formguide` (formguide.web.app) and `faceapp-5397b`. The `formguide` site must exist in the project:
   ```bash
   npx firebase-tools hosting:sites:create formguide --project faceapp-5397b
   ```

`firestore.rules` is a reference file and isn't deployed by `npm run deploy`. All reads and writes go through the functions using the Admin SDK.

## 6. Admin accounts

Admin endpoints accept a Firebase ID token from either:

- an email on the allow-list in [`shared/forms/cupAdmin.ts`](shared/forms/cupAdmin.ts), or
- any account with the custom claim `admin: true`.

To add an admin:

1. Firebase console → Authentication → Add user (email and password). The app never creates accounts.
2. Either add the email to `shared/forms/cupAdmin.ts`, then redeploy hosting and functions, or set the `admin` custom claim with the Admin SDK.

Admins sign in at `/admin` (or **Admin login** in the top bar).

## 7. Test

```bash
npm test                   # web: Vitest + form-version parity check
npm run test:functions     # functions: tsc + node:test (no network; fetch is stubbed)
npm run check:shared       # duplicated web/functions files must be byte-identical
```

`scripts/check-shared-files.mjs` lists the file pairs that are copied rather than shared (for example `pii.ts`, the HDFC v1 form data and the published-form loader). Edit one, copy it over the other, and the check passes.

## 8. Deploy

```bash
npm run deploy
```

This runs the shared-files check, builds the web app and the functions, then runs `firebase deploy --only hosting,functions`. That updates both hosting sites and all 12 functions.

Before deploying:

- **Check the branch and the working tree** (`git status`): the build uses what's on disk, including uncommitted files.
- **Make sure `web/.env` exists** (see section 3).
- To deploy only part of it: `npx firebase-tools deploy --only hosting`, or `--only functions:tts`.

Every hosting deploy clears the CDN cache, so recently cached speech lines are generated again on first use.

## 9. Check a deploy

- Open [formguide.web.app](https://formguide.web.app) and click through `/journey`, then `/speak` (try hands-free), then `/review`, then `/confirm`.
- `curl -s https://formguide.web.app/api/publishedForms` should return `{"forms":[...]}`.
- `/admin` shows the sign-in form. If it says sign-in is unavailable, the build lacked `web/.env`.
- Logs: `npx firebase-tools functions:log --only speak` (or `tts`, `ingestForm`, and so on).

## 10. Emulators (optional)

```bash
npm run emulators          # hosting + functions emulators; UI at http://localhost:4000
```

Put secrets for the emulator in `functions/.secret.local`, one `NAME=value` per line, and never commit it. Outside Google Cloud there is no service-account token, so speech uses the Gemini paths instead of Chirp. The rate limiter fails open without Firestore. To try forms locally, start the Firestore emulator and seed it:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/seed-forms.ts
```

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Hindi or regional speech reads out only digits and commas | The server voice failed (Gemini or Chirp quota, or the daily character cap), and the browser has no voice for the language. Check `functions:log --only tts` for `tts_failed` or `tts_model_failed`. |
| Voice says "Too many tries from this network" | Per-caller limit: 150 speak or planner calls per 10 minutes per IP address. Speech has its own limit of 600 per 10 minutes. |
| `transcribe_429` in `speak` logs | The Gemini key ran out of transcription quota. Use a billed key. |
| Regional language is transcribed in the wrong script | Pick the language on the Preparation page. Malayalam, Odia, Assamese and Sindhi are less reliable. |
| Deploy fails on a missing secret | `GEMINI_API_KEY` or `GROQ_API_KEY` is not in Secret Manager (section 4) |
| Admin sign-in unavailable on the deployed site | The build had no `web/.env` |
| Copilot fails under `npm run dev` | Known gap: no dev proxy for `/api/adminCopilot`. Use `/admin?mock=1`. |
