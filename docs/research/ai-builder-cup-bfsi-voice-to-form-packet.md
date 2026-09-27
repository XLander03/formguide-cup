# Research Packet — Google Cloud AI Builder Cup 2026 × India BFSI Voice-to-Form (Idea A) + TypeSafe Jev

**Audience:** Notion Handler (merge-ready)  
**Research date:** 2026-09-24 (IST / Asia/Calcutta)  
**Product lean (from brief):** English-first voice agent fills/recommends Indian bank forms; no invented form IDs; always “varies by bank”; no live bank submit; debit-reissue demo fields may use registered mobile + DOB/PAN/CIF style.  
**Prior corpus:** journeys j01–j12 exist — deepen FORM taxonomy + public PDF samples.

---

## 0. Hackathon context (AI Builder Cup 2026)

| Item | Fact | Source |
| --- | --- | --- |
| Name | **AI Builder Cup 2026** — Google Cloud JAPAC hackathon by **Hack2skill** | https://aibuildercup.com/ |
| Theme fit | **BFSI: Intelligent Risk, Fraud & Financial Experiences** — fraud/risk, process automation, customer interactions, personalized financial experiences | https://aibuildercup.com/themes.html |
| Stack mandate | Gemini/Gemma **or** agentic platforms (Agent Platform, Antigravity, AI Studio); deploy on **Cloud Run or Firebase** | themes.html |
| Submission | Working deployed link + **video demo under 3 minutes** + public GitHub + deck/PDF | https://aibuildercup.com/Faqs.html |
| Eligibility | Working professionals / entrepreneurs / startups, **age 21+**, **JAPAC-based**; teams **2–4**; **students ineligible** (any student member → team DQ) | Faqs.html |
| Timeline (official) | Reg & team formation **1 Sep – 11 Oct 2026**; prototype building **7 Sep – 18 Oct**; **prototype deadline 18 Oct 2026**; evaluation 19 Oct–6 Nov; finalists **7 Nov**; Grand Finale Singapore **4 Dec 2026** | aibuildercup.com |
| Prize pool | **USD 30,000** total; sponsored travel for finalists (2 members/team) | aibuildercup.com |
| Judging | Technical Merit & Gen AI **40%** · Problem Alignment & Impact **25%** · Innovation & Creativity **25%** · UX & Solution Design **10%** | themes.html |
| Contact | support+aibuildercup@hack2skill.com · +91 98703 30830 | themes.html |
| Gap | Some aggregators list submit close **4 Oct** — **trust aibuildercup.com (18 Oct prototype deadline; team formation 11 Oct).** | Flagged |

**Idea A alignment:** Voice-to-form for BFSI service requests maps to process automation + customer interactions under BFSI theme. Demo must be English, <3 min, Cloud Run/Firebase.

---

## 1. Taxonomy — India BFSI forms/records for MVP

**Rule:** Form *numbers/codes vary by bank*. Prefer **record type** names (e.g. “debit card reissue request”) over invented IDs. Cite bank-specific PDF only as *sample of fields*, not canonical ID.

### Priority legend
- **P0** — ≤3 min English voice demo; high frequency; short slot count; strong confirm gates
- **P1** — same-season stretch / second demo path
- **P2** — corpus completeness (j01–j12 depth); longer / multi-doc

### 1.1 KYC / account opening

| Code | Record type | P | Notes |
| --- | --- | --- | --- |
| AO-SB | Savings / CASA account opening (resident individual) | P1 | Heavy; CKYC + OVD + FATCA; better as guided recommend than full fill in 3 min |
| KYC-UPD | Re-KYC / KYC updation (individual) | **P0** | Identity + address + contact + account refs |
| KYC-NC | KYC self-declaration “no change” | P1 | Minimal; good secondary path |
| CIF-UPD | Customer / CIF profile update (name/address/mobile/email) | **P0** | Overlaps service-request hubs |

### 1.2 Service requests

| Code | Record type | P | Notes |
| --- | --- | --- | --- |
| SR-CHQ | Cheque book request | **P0** | Short form; leaves + delivery |
| SR-DBT | Debit / ATM card reissue / block / PIN regen | **P0** | **Best demo candidate** — registered mobile + DOB/PAN/CIF style; reason Lost/Damaged/Not received |
| SR-STMT | Statement / passbook / interest certificate | P1 | Often bundled in common-instruction forms |
| SR-ADDR | Address / contact change | P1 | Often needs OVD |
| SR-CLS | Account closure | P1 | Destructive; high confirm bar; reason + settlement mode |
| SR-CRF | Generic customer request form (multi-tick hub) | P1 | Axis/ICICI/SBI-style CRF — maps many intents |

### 1.3 Deposits

| Code | Record type | P | Notes |
| --- | --- | --- | --- |
| DEP-FD | Fixed / term deposit booking | P1 | Amount, tenure, payout, auto-renew |
| DEP-FDC | FD/RD premature closure or payout | P1 | Account refs + tax declarations (Form 15G/15H / bank Form 121 style — **varies by bank**) |
| DEP-SCSS | Senior Citizens Savings Scheme account opening | P2 | Age proof + nomination; govt scheme |

### 1.4 Loans

| Code | Record type | P | Notes |
| --- | --- | --- | --- |
| LN-PL | Personal / unsecured loan application | P1 | Income + employment + amount; long for 3 min — partial fill / recommend |
| LN-HL | Home loan application | P2 | Property + income + co-applicant; too long for P0 demo |

### 1.5 Nomination

| Code | Record type | P | Notes |
| --- | --- | --- | --- |
| NOM-NEW | Nomination registration (deposit/account) | **P0** | Strong demo; nominee identity + relationship + share %; **Banking Companies (Nomination) Rules, 2025** allow up to **four** nominees (simultaneous/successive) from ~1 Nov 2025 — bank PDFs updating; legacy DA-1/DA-2/DA-3 naming still appears |
| NOM-CHG | Nomination variation / cancellation | P1 | Legacy DA-2/DA-3; banks issuing updated PDFs |

### 1.6 Cards (credit) & grievances

| Code | Record type | P | Notes |
| --- | --- | --- | --- |
| CC-APP | Credit card application | P1 | Long; English demo can do intent + core slots |
| CC-REP | Credit card replacement / reissue / reactivation | P1 | Similar to debit reissue |
| GRV-UET | Unauthorized electronic transaction complaint / compensation claim | **P0**/P1 | RBI customer-liability framework; bank first, then Ombudsman; 2026 RBC directions include Annex II(1) compensation application |
| GRV-DISP | Transaction dispute (bank form) | P1 | Bank-specific dispute forms |

### Recommended P0 demo set (≤3 min English)
1. **SR-DBT** Debit card reissue (Idea A flagship)
2. **SR-CHQ** Cheque book request
3. **KYC-UPD** or **NOM-NEW** as alternate path

**Explicit non-goals for MVP demo:** live bank submit, inventing form numbers, Hindi/vernacular (English-first), full HL/PL underwriting.

---

## 2. Field groups (reusable slots) × form types

| Field group | Typical slots (English labels) | Used by |
| --- | --- | --- |
| **identity** | Full name (as in bank), DOB, gender, PAN / Form 60, Aadhaar last-4 or OVD type+number, CKYC number (if any), photo consent | AO-SB, KYC-UPD, LN-*, CC-APP, NOM-*, DEP-SCSS |
| **address** | Current / permanent, line1–3, city, state, PIN, address-proof OVD type | AO-SB, KYC-UPD, SR-ADDR, CC-*, LN-HL |
| **contact** | Registered mobile, alternate mobile, email, preferred language | Almost all; **SR-DBT demo critical** |
| **account_refs** | Account number / CIF / customer ID, branch IFSC (optional), product type (SB/CA/FD) | SR-*, KYC-UPD, DEP-*, NOM-*, SR-CLS |
| **card_refs** | Last-4 of debit/credit, card type, block flag | SR-DBT, CC-REP, GRV-UET |
| **reason_intent** | Closed set: Lost / Damaged / Not received / Expired / Upgrade / Other | SR-DBT, CC-REP, SR-CLS, GRV-* |
| **delivery** | Branch collect vs courier/mailing address; cheque leaves (25/50); name-on-card | SR-CHQ, SR-DBT, CC-REP |
| **income_emp** | Employer, occupation, monthly income, employment type | LN-PL, LN-HL, CC-APP, AO-SB (optional) |
| **property** | Property address, purchase/construction, agreement value, ownership | LN-HL |
| **deposit_terms** | Principal, tenure, interest payout mode, auto-renew, source of funds | DEP-FD, DEP-SCSS |
| **nominee** | Nominee name, DOB, relationship, address, share %, guardian if minor, successive vs simultaneous (post-2025) | NOM-*, AO-SB, DEP-* |
| **tax_decl** | Residential status, Form 15G/15H / Form 121 flags, FATCA/CRS | DEP-FDC, AO-SB, KYC-UPD |
| **grievance_txn** | Txn date/time, amount, channel (UPI/card/netbanking), merchant, cybercrime/1930 complaint no., liability narrative | GRV-UET, GRV-DISP |
| **closure** | Reason, unused cheque surrender, debit card destroy confirm, remittance to account X | SR-CLS |
| **confirm_gates** | Read-back of critical slots; explicit “submit draft / do not send to bank” | All P0 |

**Validation notes for voice:** Prefer **registered mobile + DOB + PAN/CIF** over inventing card/form numbers for SR-DBT demo. PAN format, PIN 6-digit, mobile 10-digit, IFSC pattern — deterministic validators in code; Jev for soft judgments only (§4).

---

## 3. Public sample PDF / form links

**Status key:** `OK` = attributable official URL · `VERIFY` = CDN/doc-id may rot · `HUB` = landing page (best re-fetch surface) · `THIRD` = non-bank host of bank PDF (prefer HUB)

### 3.1 Hubs (prefer these over deep CDN links)

| Bank / body | Hub | Status |
| --- | --- | --- |
| SBI KYC documents (individuals) | https://sbi.bank.in/web/personal-banking/information-services/kyc-guidelines/kyc-documents-individuals | HUB |
| SBI retail forms listing | https://retail.sbi.bank.in/npersonal/reg_forms.html | HUB (SPA — verify downloads in browser) |
| HDFC Forms Centre — Personal | https://www.hdfc.bank.in/resources/forms-centre/forms-centre-personal | HUB — AOF, Re-KYC, Nomination, FD, Account Closure, Loans, Debit Cards, etc. |
| ICICI Form Center | https://www.icici.bank.in/personal-banking/form-center | HUB — loans, re-KYC, nomination, credit card, dispute |
| Axis CRF | https://www.axisbank.com/download/CRF.pdf | OK/VERIFY |
| Axis nomination | https://www.axis.bank.in/docs/default-source/default-document-library/nomination-form.pdf?sfvrsn=ecc1c127_3 | VERIFY |
| Axis debit card application (CASA/minors) | https://www.axis.bank.in/docs/default-source/download-document/personal/cards/debit-card-application-form-for-casa-and-minors.pdf?sfvrsn=149818eb_1 | VERIFY |
| RBI notifications index | https://www.rbi.org.in/Scripts/NotificationUser.aspx | HUB |

### 3.2 KYC / account opening

| Sample | URL | Status |
| --- | --- | --- |
| SBI Account Opening Form – Resident Individual (English) | https://sbi.bank.in/documents/53471/263971/Account+Opening+Form-Resident+Individual-English+%281%29.pdf/2748b138-ec36-a969-fd2e-59d512605810?t=1763121062159 | VERIFY |
| SBI KYC Annexure B – KYC updation individual | https://bank.sbi/documents/16012/0/KYC+Annexure+B+(2).pdf/768facc2-cc61-245d-834b-b8cfdbc45757?t=1752933035205 | VERIFY |
| HDFC AOF — Individuals (Regular/Salary/BSBDA/Individual CA) | Listed on Forms Centre Personal (~10 Jul 2026 entry in hub listing) | HUB |
| HDFC Re-KYC Individuals | Forms Centre → REKYC | HUB |

### 3.3 Service requests

| Sample | URL | Status |
| --- | --- | --- |
| SBI Customer Request Form (English) | https://sbi.bank.in/documents/53471/263971/Customer+Request+Form-English.pdf/073e1162-e578-b106-eba6-d8145997ece3?t=1763105099808 | VERIFY |
| HDFC Cheque Book Requisition | https://v.hdfcbank.com/content/dam/hdfc-aem-microsites/common-pdfs/pdf/ChequeBook-Request.pdf | VERIFY |
| Axis Customer Request Form (CRF) | https://www.axisbank.com/download/CRF.pdf | OK/VERIFY |
| ICICI Customer Requests Form (debit reissue + cheque book ticks) | Prefer Form Center; common mirror: https://www.taxheal.com/wp-content/uploads/2018/07/ICICI-bank-customer-request-form.pdf | **THIRD** — re-download from Form Center |
| ICICI debit reissue help page | https://www.icici.bank.in/personal-banking/cards/debit-card/re-issue-of-lost-atm | HUB |
| HDFC Debit Cards: Blocking / PIN re-generation | Forms Centre → Debit Cards | HUB |
| HDFC Combined Account Closure | Forms Centre → Account Closure (~02 Mar 2026) | HUB |

### 3.4 Deposits / SCSS / nomination

| Sample | URL | Status |
| --- | --- | --- |
| SBI SCSS Account Opening Form (English) | https://sbi.bank.in/documents/53471/263971/SCSS+Account+Opening+Form-English.pdf/8b2d737e-1e88-ffb0-cd33-c398d5b0faba?t=1765175074863 | VERIFY |
| SBI SCSS product page | https://sbi.bank.in/web/personal-banking/investments-deposits/govt-schemes/senior-citizens-savings-scheme | HUB |
| SBI DA-1 nomination (legacy Rules 1985 naming) | https://retail.sbi.bank.in/sbi/downloads/da1.pdf | VERIFY |
| Banking Companies (Nomination) Rules, 1985 (India Code) — Forms DA-1/DA-2/DA-3 | https://www.indiacode.nic.in/ (search Banking Companies Nomination Rules 1985) | OK |
| Nomination Rules **2025** (up to 4 nominees) | PIB / central-govt PDF references; bank forms updating | Gap: confirm each bank’s *current* nomination PDF vs DA-1 legacy |
| Axis Nomination Form | https://www.axis.bank.in/docs/default-source/default-document-library/nomination-form.pdf?sfvrsn=ecc1c127_3 | VERIFY |
| HDFC Multiple Nomination Form | Forms Centre → Nomination | HUB |
| HDFC FD/RD booking (existing customers) | Forms Centre → Fixed Deposit | HUB |
| ICICI Nomination — Accounts and Deposits | Form Center → Nomination Forms | HUB |

### 3.5 Loans / credit cards

| Sample | URL | Status |
| --- | --- | --- |
| SBI Personal Loan Application (English) | https://sbi.bank.in/documents/53471/263971/Personal+Loan+Application-English.pdf/6e58998c-6343-4739-eb34-5b2b24779c69?t=1767595237452 | VERIFY |
| SBI Home Loan Application | https://raas.sbi.bank.in/assets/images/downloads/Home-Loan-Application-Form.pdf | VERIFY |
| HDFC Unsecured Loans application | Forms Centre → Loan; CDN sample: https://v.hdfc.bank.in/content/dam/hdfc-aem-microsites/common-pdfs/pdf/loans_professional_app_form.pdf | VERIFY |
| ICICI Home / Personal / Car loan forms | https://www.icici.bank.in/personal-banking/form-center (Loans section) | HUB |
| Axis Home Loan application | https://www.axis.bank.in/docs/default-source/default-document-library/home-loan/application-form-for-home-loan.pdf?sfvrsn=3c324c74_1 | VERIFY |
| Axis Credit Card forms hub | https://www.axis.bank.in/download-forms/credit-cards | HUB |
| HDFC Credit card reactivation/reissue | https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/resources/forms-centre/forms-center-personal/pdf/credit-cards/reactivationofcreditcard.pdf | VERIFY |
| ICICI Credit Card Replacement / Claim | Form Center → Credit Card | HUB |

### 3.6 Grievances / RBI

| Sample | URL | Status |
| --- | --- | --- |
| RBI — Customer Protection: Limiting Liability of Customers in Unauthorised Electronic Banking Transactions (2017) | https://www.rbi.org.in/commonman/Upload/English/Notification/PDFs/NOTI1506072017.PDF | OK |
| RBI 2026 Responsible Business Conduct notifications (Annex II compensation forms referenced) | https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13547&Mode=0 · related Id=13543 | HUB — open PDF annex from notification |
| RBI Integrated Ombudsman Scheme 2021 — Form of Complaint | Prefer official RBI scheme PDF; third-party mirrors exist | VERIFY if mirrored |
| Cybercrime reporting context | National Cybercrime Reporting Portal / dial **1930** | Policy (not a bank form) |

### 3.7 Gaps / honesty
- Deep Liferay / `sfvrsn` CDN URLs **rot**; re-check via bank Forms Centre before demo day.
- Do **not** invent form codes like “SBI-DBT-03”. Say “Axis CRF debit-card section (varies by bank)”.
- ICICI customer-request PDF often on third-party sites — **re-download from Form Center** for attribution.
- Nomination: legal framework moved to **2025 Rules** (multiple nominees); many bank PDFs still titled DA-1 — treat field groups as stable, form titles as bank-variable.
- Binary PDFs not bulk-downloaded into this packet; Handler should attach “last verified” date when pasting into Notion.

---

## 4. TypeSafe Jev / System One — what it is + voice-to-form fit

### 4.1 Identity (found — not inference)

| Claim | Detail | Source |
| --- | --- | --- |
| Product | **Jev** = TypeSafe AI’s first **System One** model | https://typesafe.ai/blog/introducing-system-one-models-and-jev — Diogo Almeida, **15 Sep 2026** |
| Naming | “System One” from Kahneman *Thinking, Fast and Slow* (fast decisions); “Jev” after William Stanley **Jevons** (efficiency → demand) | Blog FAQ |
| Not a chat LLM | No free-form string generation; **typed decisions only**; schema-guaranteed outputs (no type errors) | Blog + docs.typesafe.ai concepts |
| Primitives | **Choice** (up to 255 options → label + probs + confidence) · **Score** (2–10 ordered levels → probability-weighted score + probs + confidence) · **Noul** (yes/no → probability in [0,1], **no separate confidence**) | https://systemonemodels.org/guides/choice-score-noul/ · https://docs.typesafe.ai/primitives.md |
| API shape | `state` + keyed `questions` → parallel typed `answers`; Python/JS SDKs; model aliases e.g. `jev-latest` / versioned `jev-1.13.x` | https://docs.typesafe.ai/llms.txt · API reference |
| Patterns | Speculative fan-out · confidence-gated routing · composite scoring · intent routing | https://systemonemodels.org/guides/how-to-build-with-system-one-models/ |
| Design rule | Model **does not** choose next action / tool calls; **application code** owns thresholds & side effects | Same |
| Suggested bands (examples, not defaults) | Choice/Score: high conf → act; mid → confirm; low → escalate. Worked example: uncertainty floor ~**0.5**; destructive ops ~**0.9**. Noul: act if ≫0.9 or ≪0.1 else escalate | Confidence / how-to-build guides |
| Vendor claims | ~70–500 ms E2E; ~$0.042/M input tokens; output free; early access; RLCD training | Blog (vendor claims) |
| Secondary mirrors | jevapi.org, TokenRa gateway, Spring AI TypeSafe, crates.io `typesafe-jev` | Secondary — prefer typesafe.ai / docs.typesafe.ai for canonical request shapes |

**Unknowns / caveats**
- Early access; pin a **versioned** model id for demo reproducibility (`jev-latest` moves).
- Third-party hosts may use slightly different field names/endpoints — validate against https://docs.typesafe.ai/api.md before coding.
- Hackathon requires Google AI (Gemini/Gemma) or listed Google agentic platforms on Cloud Run/Firebase. **Jev is not a Google model.** Fit = optional decision layer *alongside* Gemini voice/NLU, or Gemini constrained to emulate Choice/Score/Noul-shaped JSON if Jev API unavailable for submission. **Flag for product decision.**

### 4.2 Mapping to voice-to-form loop

**Architecture sketch (code owns control flow):**
1. **ASR / Gemini** → utterance text (+ optional structured partial slots).
2. Assemble **state** JSON: `{ utterance, filled_slots, form_type, bank_hint, missing_required[], last_confirm }`. Keep state lean (docs: irrelevant context hurts).
3. One **System One** call with speculative fan-out questions.
4. Code routes: ask next slot · confirm · change form type · refuse out-of-scope · finalize draft PDF/JSON (**no bank submit**).

#### A. Intent / form-type routing → **Choice**
```
Choice journey_type:
  debit_reissue | cheque_book | kyc_update | nomination |
  account_closure | fd_booking | personal_loan | unauth_e_txn | other
```
- Include **`other`** so probability mass isn’t forced onto wrong label.
- If `confidence` low (e.g. <0.7) → clarify in voice; don’t fill.

#### B. Slot validation / soft checks → **Noul** (+ deterministic code)
Examples after candidate extract:
- `noul_pan_plausible` — spoken value looks like Indian PAN?
- `noul_mobile_is_registered_claim` — user asserts bank-registered mobile?
- `noul_dob_complete` — full calendar date present?
- Hard format checks (regex, PAN checksum, 10-digit mobile) stay in **code** (docs: arithmetic/dates weak on Jev).

#### C. Confirm gates → **Noul** + **Score**
- `noul_user_confirmed_readback` — after TTS read-back of account last-4 + reason + delivery.
- `score_confirmation_clarity`: e.g. `unclear / hedged / clear_yes`.
- Destructive (closure, card block): require Choice/Score **confidence ≥ ~0.9** *and* Noul confirm ≫0.9 before enabling “Generate draft”.

#### D. Incomplete-field routing → **Choice** + **Score**
- `Choice next_ask`: which missing required slot to solicit next.
- `Score completeness`: `empty / partial_core / demo_ready / full_bank_packet` — gate UI progress.
- Speculative fan-out: ask `reason`, `delivery_pref`, `has_cif`, `wants_branch_pickup` even if some unused.

#### E. Reason / delivery enums → **Choice**
- Debit reissue reason: `lost | damaged | not_received | expired | other`
- Delivery: `courier_registered_address | branch_collect`

#### F. Grievance severity / urgency → **Score**
- Unauthorized txn: urgency as Score; still **no auto-filing** to bank/RBI in MVP.

#### G. Guardrails → **Noul**
- `noul_requests_live_bank_submit` → refuse; explain draft-only.
- `noul_prompt_injection` on raw utterance before merging into state.
- `noul_out_of_scope_non_bfsi`.

### 4.3 Concrete P0 debit-reissue loop (example)

| Step | State snippet | Jev questions | Code action |
| --- | --- | --- | --- |
| 1 | utterance only | Choice `journey_type`, Noul `is_english_bfsi_service` | Route to SR-DBT template |
| 2 | partial slots | Choice `reason`, Choice `delivery`, Noul `mobile_provided`, Noul `dob_or_pan_or_cif_provided` | Ask highest-priority missing |
| 3 | all required present | Score `completeness`, Noul `ready_for_readback` | TTS confirm |
| 4 | after “yes” | Noul `explicit_confirm`, Score `confirm_clarity` | If high → emit **draft** JSON/PDF fields; never POST to bank |

### 4.4 If Jev API blocked for Cup compliance
**Label: product fork, not research gap.** Emulate System One shape with Gemini structured output:
```json
{ "answers": {
  "journey_type": { "type": "choice", "choice": "...", "probabilities": {}, "confidence": 0.0 },
  "ready_for_readback": { "type": "noul", "noul": 0.0 }
}}
```
Keep same routing code; swap client. Cite TypeSafe as design inspiration in deck.

### 4.5 Finding note
**TypeSafe Jev is a real public product** (early access, announced 15 Sep 2026), not an internal nickname. Primary sources: typesafe.ai blog, docs.typesafe.ai, systemonemodels.org. Secondary aggregators (jevapi.org / TokenRa) exist; treat as mirrors.

---

## 5. Mapping to prior journeys j01–j12 (depth targets)

| Journey | Taxonomy code | Deepen with |
| --- | --- | --- |
| j01 savings KYC | AO-SB | SBI/HDFC AOF field groups; CKYC/FATCA slots |
| j02 re-KYC | KYC-UPD | SBI Annexure B; HDFC Re-KYC Individuals |
| j03 personal loan | LN-PL | SBI PL PDF; HDFC Unsecured; ICICI credit facility form |
| j04 home loan | LN-HL | SBI/Axis/ICICI HL forms — P2 for demo |
| j05 FD | DEP-FD / DEP-FDC | HDFC FD booking; tax Form 121 style |
| j06 cheque book | SR-CHQ | HDFC cheque requisition; Axis/ICICI CRF ticks |
| j07 debit reissue | SR-DBT | **P0** — Axis CRF, ICICI customer request, HDFC block/PIN forms |
| j08 nomination | NOM-* | Axis nomination PDF; HDFC multiple nomination; DA-1 legacy |
| j09 account closure | SR-CLS | SBI CRF; HDFC Combined Account Closure |
| j10 SCSS | DEP-SCSS | SBI SCSS AOF |
| j11 credit card | CC-APP / CC-REP | ICICI/Axis/HDFC card forms |
| j12 unauth e-txn | GRV-UET | RBI 2017 liability circular + 2026 Annex II(1) compensation form |

---

## 6. Product constraints checklist (for Notion props)

- [ ] English-first voice demo ≤3 min
- [ ] No invented form IDs; UI copy: “Fields vary by bank”
- [ ] No live bank submit / no real credentials
- [ ] Debit reissue demo slots: registered mobile + DOB and/or PAN/CIF (not fake form numbers)
- [ ] Deploy Cloud Run or Firebase; Gemini/Gemma (or approved agentic) for Cup eligibility
- [ ] Jev optional decision layer — document compliance fork
- [ ] All sample PDFs attributed; VERIFY CDN before finale

---

## 7. Source index (primary)

1. https://aibuildercup.com/
2. https://aibuildercup.com/themes.html
3. https://aibuildercup.com/Faqs.html
4. https://typesafe.ai/blog/introducing-system-one-models-and-jev
5. https://systemonemodels.org/guides/choice-score-noul/
6. https://systemonemodels.org/guides/how-to-build-with-system-one-models/
7. https://docs.typesafe.ai/llms.txt (and linked concept/API pages)
8. https://www.hdfc.bank.in/resources/forms-centre/forms-centre-personal
9. https://www.icici.bank.in/personal-banking/form-center
10. https://sbi.bank.in/web/personal-banking/information-services/kyc-guidelines/kyc-documents-individuals
11. https://www.axisbank.com/download/CRF.pdf
12. https://www.rbi.org.in/commonman/Upload/English/Notification/PDFs/NOTI1506072017.PDF
13. https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=13547&Mode=0

---

## 8. Open gaps for follow-up

1. Re-verify Oct deadlines on aibuildercup.com (aggregator conflict: 4 Oct vs 18 Oct).
2. Download binary PDFs from HDFC/ICICI hubs into artifact store (this packet has hubs + selected deep links only).
3. Confirm which bank nomination PDFs fully reflect **2025 Rules** (4 nominees).
4. Decide Cup-compliance path: Gemini-only structured decisions vs Gemini voice + Jev decisions.
5. Map exact required vs optional slots per P0 template from one chosen bank PDF each (SR-DBT, SR-CHQ, KYC-UPD).
