# FormGuide Cup — docs & corpus

English-first voice→AOF+KYC demo assets for Google Cloud AI Builder Cup (JAPAC).

## Layout

| Path | Contents |
| --- | --- |
| `docs/schema/` | `aof_kyc_demo_v1` field schema (JSON + notes) |
| `docs/research/` | Idea A research packet + taxonomy notes |
| `corpus/bank-forms/` | Public sample bank PDFs (attributed hubs; no invented form IDs) |
| `corpus/bank-forms/_blocked/` | URLs/files bots could not download (user may add) |

## Demo bar (research lean)

- AOF + KYC core; confirm-before-submit; **no live bank submit**
- UI copy: “Fields vary by bank”
- Gates: Gemini structured JSON (Choice/Score/Noul-shaped). TypeSafe Jev optional only if asked.

## Cite hubs (prefer over deep CDN)

- HDFC Forms Centre — Personal: https://www.hdfc.bank.in/resources/forms-centre/forms-centre-personal
- SBI KYC Documents — Individuals: https://sbi.bank.in/web/personal-banking/information-services/kyc-guidelines/kyc-documents-individuals
- ICICI Form Center: https://www.icici.bank.in/personal-banking/form-center

Do not invent bank form numbers.
