# Instructions — Cross-country scope & language inclusion

> This extends, not replaces, the locked demo bar: India **AOF + KYC core, English, confirm-before-submit** stays the pass bar for the ≤3 min timed Cup demo (see `docs/schema/aof_kyc_demo_v1.notes.md` and Decisions on Notion). Nothing here reopens that lock without Product Scope sign-off.

## Purpose

Working instructions for adding **cross-country scope** and **language inclusion** to Idea A (FormGuide / FormSaathi) as an *architecture and judging-narrative layer* — proving the engine generalizes beyond India/English — without risking demo-clarity on 18 Oct.

## Why this matters for judging

The event is JAPAC-wide (Google Cloud AI Builder Cup 2026). A pure India/English demo is a strong, safe MVP, but "innovation" (25%) and "impact" (25%) score higher if we can show the same pipeline is **schema-agnostic across markets and languages**, not hardcoded to one country's forms. This should show up as a short proof-of-concept segment or deck slide, not as a second full demo track.

## 1. Cross-country scope

### Principle

Do not build a second bespoke pipeline per country. Refactor the existing `aof_kyc_demo_v1.schema.json` field taxonomy so country-specific identity/format rules are **config-driven**, not hardcoded.

### How

- Replace hardcoded India-only fields (e.g. `ovd_poi_type: PAN/Aadhaar`) with generic slots (e.g. `identity.national_id`) plus a **per-country validator config**:
  - India: PAN regex, Aadhaar (masked), IFSC
  - Singapore: NRIC format, SGD amounts
  - Indonesia: NIK, KTP
  - Philippines: TIN
- Each country config maps its own form's field list onto the shared field-group taxonomy already in use: `identity · address · contact · account_refs · kyc_ovd · profile_light · confirm_gates`
- Keep the same non-goals for every country: no live bank submit, no invented form IDs, cite only real, sourced bank/government form fields (same standard already applied to the Indian corpus — SBI/HDFC/ICICI/Axis).

### Recommended proof-of-concept market

**Singapore** — English-first (avoids stacking a second language on top of a second country for the first cut), well-documented public bank account-opening field lists, plausible reference for a JAPAC judging panel.

### Scope guardrails

- Build **one** additional country schema (Singapore account-opening), not a full second corpus
- Reuse the existing pipeline (STT → route → extract → gap-loop → readback → confirm) unchanged — only the schema config swaps
- Demo this as a short segment (~15–20s) or a deck slide ("same engine, second market, zero pipeline changes") — do not let it extend the <3 min video
- Do not touch the locked India English pass bar to make room for this

## 2. Language inclusion

### Open question carried over from research (2026-09-18, still unresolved)

Earlier lean was English-first; user also wants Hindi+English for demo. **Product Scope needs to confirm the language bar before this is built** — do not build ahead of that decision.

### If/when approved, implementation approach

- **STT**: Whisper already supports multilingual input — no new STT infra needed, just enable additional language codes (e.g., `hi` for Hindi)
- **Extraction**: Gemini prompt should accept transcript in source language and extract into the same schema field structure regardless of input language — the schema itself stays language-neutral (field keys, not display labels)
- **TTS readback**: needs a matching multilingual TTS voice (e.g., Piper has Hindi voices) so the confirmation loop stays in the user's spoken language, not just the input
- **UI copy**: keep "fields vary by bank" and citation disclaimers translated, not just the conversational turns

### Guardrails

- Do not silently mix languages mid-flow — detect language once at session start (or let user pick), keep it consistent through extraction, readback, and confirmation
- Language expansion is a **stretch**, not a prerequisite — if it risks the ≤3 min timing or introduces TTS/STT reliability issues close to 18 Oct, defer and keep English-only for the scored demo (SR-DBT was already treated this way — contingency only, ping Product Scope before switching)

## 3. Sequencing

1. Ship and harden the locked India AOF+KYC English pipeline first
2. Once stable, refactor schema into country-config shape (should be non-destructive to the India path)
3. Build Singapore schema as the second config — validate the same pipeline runs unmodified
4. Only after both are stable, and only with Product Scope sign-off, evaluate adding Hindi+English to the timed demo; otherwise present as roadmap only
5. Update the pitch deck with the "schema-agnostic, JAPAC-ready" framing once the proof-of-concept works

## Related

- `docs/schema/aof_kyc_demo_v1.schema.json` / `.compact.json` — schema this extends
- `docs/research/IdeaA_FormGuide_Research.md` — original research brief
- `docs/research/ai-builder-cup-bfsi-voice-to-form-packet.md` — researcher packet (record codes, field groups)
- Notion: [Instructions — Cross-country scope & language inclusion](https://app.notion.com/p/3e8cce4c83fb81b4b8e2e38544885c2a) — synced copy for the team workspace
