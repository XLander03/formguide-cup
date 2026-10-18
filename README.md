# FormGuide

**Fill an Indian bank form by voice.** A customer speaks in English, Hindi or one of ten other Indian languages; FormGuide fills the bank's form, asks only for what is missing, reads every detail back in the customer's language, and saves a reviewed draft. Nothing is ever submitted to a bank.

Built for the Google Cloud AI Builder Cup. Repository: [github.com/XLander03/formguide-cup](https://github.com/XLander03/formguide-cup)

- **Live app:** [formguide.web.app](https://formguide.web.app) (also served at [faceapp-5397b.web.app](https://faceapp-5397b.web.app))
- **Admin console:** [formguide.web.app/admin](https://formguide.web.app/admin) (Firebase Auth sign-in, allow-listed accounts only)

## What it does

**For customers**

- **Four journeys:** account opening, KYC update, Re-KYC and debit card reissue. A planner turns one description ("I moved and lost my card") into an ordered set of forms, and shared answers carry over between them.
- **Twelve languages:** English, Hindi, Bengali, Marathi, Telugu, Gujarati, Kannada, Malayalam, Odia, Punjabi, Assamese and Sindhi. The language can be picked or detected from the first answer. Malayalam, Odia, Assamese and Sindhi are less reliable today.
- **Voice filling:** one answer can fill many fields. Answers are checked for format (PAN, PIN, mobile, dates) and against each other, and unclear ones are flagged with "Check this".
- **Hands-free mode:** FormGuide asks each question aloud, listens until the customer stops talking, fills the fields and asks the next one. The customer can correct ("No, my PIN is 560037"), ask ("What is CKYC?") or give commands ("read it again", "go back", "download my form") in any supported language.
- **Read-back and confirm:** every detail is read back before three confirmation checks. The result is a draft with a receipt, a JSON handoff (each field's value, what was said, and confidence) and, for KYC forms, the bank's own PDF filled in.

**For banks (admin console)**

- Upload a bank's PDF form (fillable or scanned). Gemini maps its boxes, a vision agent checks them, and an admin reviews low-confidence fields before publishing. Published forms appear to customers immediately.
- An "Ask about your forms" copilot answers questions about forms and anonymous usage, and can propose unpublishing or retiring a form, but only an admin can act.

**Guarantees:** draft only, never a bank submission. Confirm before save. Aadhaar is kept as the last 4 digits only. No OTP, PIN or CVV fields exist. UI copy says "Fields vary by bank", and the app never invents bank form IDs.

## Stack

| Part | Technology |
| --- | --- |
| Web app (`web/`) | React 18, TypeScript, Vite, Tailwind CSS 4, pdf-lib and pdf.js, Firebase Auth (admin only) |
| Server (`functions/`) | Firebase Cloud Functions (2nd gen, Node 22), Firestore (database `formguide`), Cloud Storage |
| AI | Gemini (speech-to-text, field extraction, planning, OCR, verification agent, copilot, backup speech), Cloud Speech-to-Text Chirp 3 (regional languages, language detection), Cloud Text-to-Speech Chirp 3 HD (spoken questions and read-back), Groq Whisper (optional speech-to-text fallback) |
| Hosting | Firebase Hosting, two sites, with `/api/*` rewritten to the functions |

## Quick start

```bash
npm ci --prefix web
npm run dev            # http://localhost:5173
```

The dev server sends `/api/*` calls to the deployed functions, so voice works locally without any keys. Add `?demo=1` to show the sample-phrase and sample-draft helpers, or open `/admin?mock=1` for the admin console with in-browser mock data.

Full setup (keys, Firebase, Cloud APIs, admin accounts, deploy) is in **[SETUP.md](SETUP.md)**. How it works inside is in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Commands

Run these from the repo root.

| Command | What it does |
| --- | --- |
| `npm run dev` | Web dev server |
| `npm test` | Web tests (Vitest) and the form-version parity check |
| `npm run test:functions` | Typecheck and test the functions |
| `npm run check:shared` | Check that files duplicated between `web/` and `functions/` still match |
| `npm run build` / `npm run build:functions` | Production builds |
| `npm run emulators` | Hosting and functions emulators |
| `npm run deploy` | Build both, then deploy hosting and functions |

## Repository layout

```
formguide-cup/
  web/                 React app: customer flow (/, /journey, /speak, /review, /confirm) and admin (/admin)
  functions/           Cloud Functions: speak, tts, planJourney, form ingest/publish, admin console APIs
  shared/              Code used by both: form types, admin API contract, voice commands, journey plan
  scripts/             check-shared-files, emit-hdfc-v1 (bundled form), seed-forms (Firestore emulator)
  docs/                Field schema (aof_kyc_demo_v1) and research; see docs/README.md
  corpus/bank-forms/   Public sample bank PDFs used for ingest testing
  submission/          Cup submission deck
  firebase.json        Hosting sites, rewrites, cache headers, functions, emulators
  firestore.rules      Reference rules; the app reads and writes through the Admin SDK
```

`gemini_client.py`, `test.py`, `requirements.txt` and `app/` are left over from an early Python prototype and are not part of the app.

## Contributing

- Branch from `main` and open a pull request. Run `npm test`, `npm run test:functions` and `npm run check:shared` first.
- `docs/schema/`, `docs/research/` and `corpus/` are owned by the research side of the team. The app keeps its working copy of the schema in `web/src/schema/`.
- Never commit keys: `.env` and `web/.env` are git-ignored, and production keys live in Firebase Secret Manager.
