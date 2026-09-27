# Builders Cup — Idea A research brief
**FormGuide / FormSaathi** — India-first BFSI voice-to-form agent (English first)  
Research date: 24 Sep 2026 (Asia/Calcutta)  
Scope: public bank/regulatory **forms & records** for voice-assisted filling — not call-centre insights; not Insight Loop.

---

## A) Form taxonomy (voice-to-form relevant)

Focus: **customer-filled** paper/PDF/branch request forms and statutory declarations that map cleanly to a structured slot-filling loop. Excludes pure staff CBS screens, call-centre scripts, and long legal agreements unless the customer still fills discrete fields.

| Type | Purpose | Who fills | Typical fields | Voice UX pain points | MVP? | Sample source URLs |
|------|---------|-----------|----------------|----------------------|------|--------------------|
| **Account Opening Form (AOF) — Resident Individual** | Open SB / salary / BSBDA / individual CA; create CIF | New/existing resident individual (often with joint applicant / guardian for minor) | Name parts, DOB, gender, PAN/Form 97/60 successor, Aadhaar consent + DBT/non-DBT, nationality, mother maiden name, addresses + landmark, operating instruction (single/EorS/joint), CKYC no., photo/sign, FATCA/CRS, nominee section, product tick | Very long; multi-applicant; many tick boxes; ID numbers need confirm-readback; photo/sign not voice; landmark/address ambiguity | **MVP slice** (demo subset of personal + address + product + nominee) | [HDFC AOF Individuals](https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/pdf/forms-centre/personal-banking/account-openings/Account%20Opening%20Form%20-%20For%20Individuals%20(%20for%20opening%20Regular%20Savings%20Account,%20Basic%20Savings%20Bank%20Deposit%20Account,%20Individual%20Current%20Account).pdf) · [Axis Savings & Current AOF](https://www.axis.bank.in/docs/default-source/default-document-library/download-document/personal/accounts/download-account-opening-form.pdf?sfvrsn=4a62da4_9) · [Kotak Resident CRF](https://www.kotak.bank.in/content/dam/Kotak/Customer-Service/Download-Forms/Personal-Banking/Account-Opening/resident-individual-customer-relation-form-english.pdf) · [PNB AOF revised](https://www.pnbindia.in/document/download-form/aof_revised.pdf) · SBI AOF URL exists but WAF-blocked (see §C) |
| **CKYC / KYC Application (Individual)** | CERSAI CKYCR record create/update; OVD + personal details | Customer via RE (bank/AMC/etc.) | Application type New/Update, KYC number, account type Normal/Minor/Aadhaar OTP e-KYC, name, father/spouse, mother, DOB, gender, PAN/Form 60, marital, citizenship, residential status, PoI/PoA OVD codes, current vs permanent address, related person, FATCA | Code lists (state/country); OVD choice; Aadhaar masking rules; “update only these sections” logic | **MVP** (canonical identity schema) | [AMFI CKYC Individual](https://portal.amfiindia.com/spages/CKYC-KRA-KYC-FormforIndividuals.pdf) · StockHolding twin URL WAF-blocked |
| **Nomination (DA-1 style / Banking Companies Nomination Rules 2025)** | Nominate / cancel / vary nominees for deposits (and often lockers) | Account holder(s); guardian if minor | Branch, A/c no., depositor names, nomination type successive vs simultaneous, nominee name/address/email/mobile/relation/DOB, priority or share %, witness/thumb where needed | Multi-nominee share % must sum 100; successive vs simultaneous is a branching concept; names/relations easy to mis-hear | **MVP** (single nominee first) | [Kotak Nomination Deposits](https://www.kotak.bank.in/content/dam/Kotak/Customer-Service/Download-Forms/Personal-Banking/Nomination/form-for-nomination-cancellation-of-nomination-and-variation-of-nomination-in-respect-of-the-ban.pdf) · [Axis Nomination 2025](https://www.axis.bank.in/docs/default-source/default-document-library/nomination-form.pdf?sfvrsn=ecc1c127_3) · [HDFC Multiple Nomination](https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/pdf/forms-centre/personal-banking/nomination/Multiple-Nomination-Form.pdf) · [ICICI Nomination Accounts & Deposits](https://www.icici.bank.in/content/dam/icicibank/india/managed-assets/docs/pdf/nomination-form-for-accounts-and-deposits.pdf) · [Axis CASA/TD Nomination](https://www.axis.bank.in/docs/default-source/download-document/personal/accounts/nomination-form-for-casatd-ri-and-nri.pdf?sfvrsn=9591fbae_3) |
| **RTGS / NEFT / IMPS fund-transfer request** | One-shot remittance instruction at branch | Remitter (customer or non-customer cash NEFT ≤ ₹49,999 on some banks) | Channel tick RTGS/NEFT/IMPS; amount + words; debit mode cash/cheque; remitter A/c, name, address, mobile, LEI if ≥ ₹50 Cr non-individual; beneficiary name, A/c (reconfirm), type, IFSC (11), bank/branch, remarks | **IFSC + account number** are high-stakes; amount digits vs words; LEI rare but blocking; reconfirm field needs deliberate voice protocol | **MVP** (retail individual, no LEI) | [Axis RTGS/NEFT/IMPS](https://www.axis.bank.in/docs/default-source/default-document-library/download-document/personal/accounts/rtgs-neft-request.pdf) · [Kotak RTGS/NEFT](https://www.kotak.bank.in/content/dam/Kotak/Customer-Service/Download-Forms/Personal-Banking/Remittance/rtgs-and-neft-form-semi-editable-3feb.pdf) |
| **Form 121 (ex-15G/15H) — TDS non-deduction declaration** | Declare nil tax so bank does not deduct TDS on interest etc. (IT Rules 2026; TY from 01-Apr-2026) | Resident individual/HUF etc. eligible under s.393(6) | Name, address, PAN, status, residential status, age≥60 Y/N, email, phone, tax year, nature of income, estimated income for declaration, prior Form 121 count/aggregate, estimated total income, prior ITR details, income payer details | Numeric income estimates; multi-column aggregates; eligibility gate (age/tax nil) before fill; English legal phrasing | **MVP** (high demo value; short; seasonal) | Bank copies: [HDFC Form 121](https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/pdf/forms-centre/personal-banking/fixed-deposit/Form_121.pdf) · [ICICI Form 121](https://www.icici.bank.in/content/dam/credit-cards/form_121.pdf) · ITD host pages 403 from research egress (see §C) |
| **Re-KYC / Customer Information Updation** | Periodic KYC refresh / profile change | Existing individual customer | CIF/customer ID, name, contact, address change Y/N, OVD refresh, occupation/income band, “no change” declaration variants | Often “delta only”; customers say “nothing changed” — need Noul gate before deep slots | **MVP** | [HDFC ReKYC Individuals](https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/pdf/forms-centre/personal-banking/rekyc/rekycrekycformindividuals.pdf) · [Axis Re-KYC](https://www.axis.bank.in/docs/default-source/default-document-library/download-document/personal/accounts/re-kyc-form.pdf?sfvrsn=1bea65df_3) · [ICICI Customer Info Updation Individual](https://www.icici.bank.in/content/dam/credit-cards/customer-information-updation-form-individual-customers.pdf) |
| **Fixed / Recurring Deposit booking** | Book FD/RD (new or existing customer packs) | Existing (simpler) or new customer | Amount, tenure, interest payout, auto-renewal, debit A/c, maturity instruction, nominee, Form 121 link | Tenure spoken as “one year” vs days; payout options; product variants | **MVP** (existing-customer FD) | [HDFC FD/RD booking <₹5 Cr existing](https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/pdf/forms-centre/personal-banking/fixed-deposit/fixeddepositfixedrecurringdepositbookingformforbelow5crdepositforexistingcustomers.pdf) · [Axis FD new](https://www.axis.bank.in/docs/default-source/default-document-library/fixed-deposit-account-opening-form-for-new-customers.pdf?sfvrsn=5c34d310_6) · [Axis FD existing](https://www.axis.bank.in/docs/default-source/default-document-library/fixed-deposit-account-opening-form-for-existing-customers.pdf?sfvrsn=8f058cd0_7) |
| **Customer / Common Request (service multi-form)** | Cheque book, stop cheque, statement, interest cert, passbook, signature verification, address change, etc. | Existing customer | Account no., request type ticks, cheque ranges, period for statement, delivery mode | **Intent routing** across many ticks; stop-cheque needs range validation | **MVP** (2–3 intents) | [Axis Customer Request](https://www.axis.bank.in/docs/default-source/default-document-library/download-document/personal/accounts/customer-request-form.pdf?sfvrsn=22511062_4) · [HDFC Common Instruction (statement/etc.)](https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/pdf/forms-centre/personal-banking/common-requests/Common%20Instruction%20Form-%20Statement%20Request%20-%20Balance%20Confirmation%20-%20Interest%20Certificate%20-%20Signature%20Verification%20-%20Passbook%20Issuance.pdf) · SBI Customer Request URL WAF-blocked |
| **Aadhaar seeding / DBT consent** | Link Aadhaar to account for DBT / non-DBT | Account holder(s) | Aadhaar (masked handling), account, consent type DBT vs non-DBT, multi-applicant consent | Privacy: never store full Aadhaar in logs; consent wording must be confirmed | Later (compliance-heavy) | [Axis Aadhaar Seeding](https://www.axis.bank.in/docs/default-source/default-document-library/download-document/personal/accounts/aadhaar-seeding-form.pdf?sfvrsn=d3b97125_1) · [HDFC DBT Aadhaar consent](https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/pdf/forms-centre/personal-banking/customer-profile-updation-forms/DBT%20Consent%20form%20for%20Aadhar%20Seeding.pdf) |
| **FATCA/CRS self-certification** | Tax residency declaration | Individual / non-individual | US person Y/N, tax residency countries, TIN, birth country | Rare vocabulary; branching on US person | Later | [ICICI FATCA Individual](https://www.icici.bank.in/content/dam/credit-cards/fatca-individual.pdf) |
| **Dormant / inoperative activation** | Reactivate dormant account | Resident individual | CIF, reason, KYC refresh, fresh contact | Overlaps Re-KYC; low demo novelty | Later | [HDFC Dormant Activation RI](https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/pdf/forms-centre/personal-banking/customer-profile-updation-forms/dormant-activation-form-resident-individual.pdf) |
| **Term deposit closure / partial withdrawal** | Close or partially withdraw FD | Depositor | FD number, amount, credit A/c, premature reason | Amount vs full closure ambiguity | Later | [Axis TD closure/partial](https://www.axis.bank.in/docs/default-source/default-document-library/term-deposit-closure-partial-withdrawal-request-form.pdf?sfvrsn=5dc6c27e_3) |
| **Form 60 / Form 97/98 (non-PAN)** | Declare no PAN for specified transactions (regime migrating under IT Rules 2026) | Person without PAN | Identity, transaction type, estimated income, reasons | Edge case; legal sensitivity | Later | ITD URLs 403 here; referenced on bank AOFs (“attach Form 97”) |
| **PPF / SSY / SCSS / KVP / Capital Gain A/c** | Govt small-savings & CG accounts via bank | Eligible individuals | Scheme-specific + nomination | Niche; long | Later | Axis forms centre lists many: https://www.axis.bank.in/download-forms/account |
| **Locker hire / locker nomination / supplementary agreement** | Safe deposit locker | Hirer | Locker no., nominees, agreement ticks | Legal + physical visit | Later | HDFC / ICICI locker nomination pages |
| **Deceased claim packs** | Settle deposits/lockers on death | Nominee / legal heirs | Death cert refs, indemnity, NOC, inventory | Multi-party; not solo voice fill | Out of MVP | ICICI / Axis / HDFC deceased annexures |
| **Loan / credit-card application packs** | Underwriting applications | Applicant | Income, employment, KYC, mandates | Heavy docs + underwriting — different product | Out of MVP (Idea A) | ICICI form centre loan PDFs |
| **NRI AOF / remittance** | NRE/NRO etc. | NRI | Overseas address, visa, FEMA declarations | Visa/FEMA complexity | Later | Kotak NRI RTGS/NEFT sample saved |

### Cross-cutting “records” (not forms, but voice-relevant)
- **IFSC + account number pair**, **PAN**, **CKYC Identifier**, **Customer ID / CIF**, **cheque leaf range**, **FD receipt number** — treat as first-class fields with confirm-before-commit.
- **OVD enum** (Passport / Voter / DL / NREGA / NPR / Aadhaar PoP) shared across CKYC, AOF, Re-KYC.

---

## B) Recommended MVP corpus (top 7 for demo)

Prioritize: (1) short enough for a live voice demo, (2) high recognition in Indian BFSI, (3) clear structured slots, (4) we already have downloadable PDFs.

| # | Form | Why for demo | Saved sample | Voice loop focus |
|---|------|--------------|--------------|------------------|
| 1 | **Nomination (single nominee)** | Universal; emotional + regulatory; Rules 2025 fields are crisp | `Kotak_Nomination_Form_Deposits.pdf`, `Axis_Nomination_Form_2025.pdf`, `ICICI_Nomination_Accounts_Deposits.pdf` | Intent = nominate; slots name/relation/DOB/share; confirm before submit |
| 2 | **RTGS/NEFT request (retail)** | Classic high-stakes form; IFSC/A/c readback shines | `Axis_RTGS_NEFT_IMPS_Request.pdf`, `Kotak_RTGS_NEFT_Form.pdf` | Channel choice; amount+words; beneficiary A/c reconfirm; IFSC |
| 3 | **Form 121 (TDS declaration)** | Timely (15G/15H → 121 from TY 2026-27); short Part A | `HDFC_Form_121_TDS_Declaration.pdf`, `ICICI_Form_121_TDS_Declaration.pdf` | Eligibility Noul (age≥60? tax nil?); income estimates; tax year |
| 4 | **CKYC Individual (core identity block)** | Shared schema across banks | `AMFI_CKYC_KYC_Form_Individual.pdf` | Name/DOB/PAN/address/OVD; section New vs Update |
| 5 | **Customer Request — statement / cheque book / stop cheque** | Intent routing showcase | `Axis_Customer_Request_Form.pdf`, `HDFC_Common_Instruction_Form_Statements.pdf` | Choice of request type; then type-specific slots |
| 6 | **FD booking (existing customer)** | Natural “I want an FD” utterance | `HDFC_FD_RD_Booking_Existing_Customers.pdf`, `Axis_FD_Opening_Existing_Customers.pdf` | Amount, tenure, payout, debit A/c, nominee yes/no |
| 7 | **Re-KYC / profile update (individual)** | “Nothing changed” vs delta fill | `HDFC_ReKYC_Form_Individuals.pdf`, `ICICI_Customer_Information_Updation_Individual.pdf`, `Axis_ReKYC_Form.pdf` | Completeness gate; change-detection Noul |

**Stretch / partial AOF demo:** walk only Personal Details + Mailing Address + Nomination on `HDFC_Account_Opening_Form_Individuals.pdf` or `Kotak_Resident_Individual_CRF_Account_Opening.pdf` — do **not** attempt full AOF in MVP live demo.

**Defer for later:** full AOF + FATCA + Aadhaar seeding + deceased claim + loans + NRI packs.

---

## C) Download results

**Folder:** `/workspace/builders-cup/bank-forms/`  
**Saved PDFs:** 31 files  
**Blocked evidence:** `/workspace/builders-cup/bank-forms/_blocked/` (+ `BLOCKED_URLS.md`)

### Saved paths (by bank / source)

| Path | Form |
|------|------|
| `AMFI_CKYC_KYC_Form_Individual.pdf` | CKYC/KYC Individual (AMFI portal) |
| `HDFC_Account_Opening_Form_Individuals.pdf` | HDFC AOF Resident Individuals |
| `HDFC_KYC_Resident_Individual.pdf` | HDFC KYC Application (Resident Individuals) |
| `HDFC_Form_121_TDS_Declaration.pdf` | Form 121 |
| `HDFC_Multiple_Nomination_Form.pdf` | Multiple nomination |
| `HDFC_ReKYC_Form_Individuals.pdf` | Re-KYC Individuals |
| `HDFC_FD_RD_Booking_Existing_Customers.pdf` | FD/RD booking existing |
| `HDFC_Common_Instruction_Form_Statements.pdf` | Statement / interest cert / passbook / etc. |
| `HDFC_Aadhaar_DBT_Seeding_Consent.pdf` | DBT Aadhaar consent |
| `HDFC_Dormant_Activation_Resident_Individual.pdf` | Dormant activation |
| `Axis_Savings_Current_Account_Opening_Form.pdf` | Axis Savings & Current AOF |
| `Axis_Account_Opening_Form_alt.pdf` | Axis AOF alternate copy |
| `Axis_RTGS_NEFT_IMPS_Request.pdf` | RTGS/NEFT/IMPS |
| `Axis_Nomination_Form_2025.pdf` | Nomination Rules 2025 |
| `Axis_Nomination_CASA_TD.pdf` | CASA/TD nomination |
| `Axis_Customer_Request_Form.pdf` | Customer request |
| `Axis_FD_Account_Opening_New_Customers.pdf` | FD new customers |
| `Axis_FD_Opening_Existing_Customers.pdf` | FD existing |
| `Axis_Term_Deposit_Closure_Partial_Withdrawal.pdf` | TD closure/partial |
| `Axis_ReKYC_Form.pdf` | Re-KYC |
| `Axis_Aadhaar_Seeding_Form.pdf` | Aadhaar seeding |
| `Kotak_Resident_Individual_CRF_Account_Opening.pdf` | Resident Individual CRF / AOF |
| `Kotak_Nomination_Form_Deposits.pdf` | Nomination deposits |
| `Kotak_RTGS_NEFT_Form.pdf` | RTGS/NEFT personal |
| `Kotak_NRI_RTGS_NEFT_Form.pdf` | NRI RTGS/NEFT |
| `ICICI_Form_121_TDS_Declaration.pdf` | Form 121 |
| `ICICI_Nomination_Accounts_Deposits.pdf` | Nomination A/c & deposits |
| `ICICI_Customer_Information_Updation_Individual.pdf` | Customer info update / Re-KYC-ish |
| `ICICI_FATCA_CRS_Individual.pdf` | FATCA/CRS Individual |
| `ICICI_GIFT_City_Relationship_Form_Individual.pdf` | GIFT City relationship (proxy individual pack) |
| `PNB_Account_Opening_Form_Revised.pdf` | PNB AOF revised |

### Blocked / unavailable from this egress

| Form | Exact URL | Blocker |
|------|-----------|---------|
| SBI Account Opening Resident Individual | `https://sbi.bank.in/documents/26274/3200842/041122-Account+Opening+Form.pdf/f342f6b0-e8f6-ac55-951d-2ca7179bc2d7?t=1667552399747` | WAF HTML **Request Rejected** |
| SBI Customer Request Form English | `https://sbi.bank.in/documents/53471/263971/Customer+Request+Form-English.pdf/073e1162-e578-b106-eba6-d8145997ece3?t=1763105099808` | WAF **Request Rejected** |
| SBI Nomination DA-1 | `https://retail.sbi.bank.in/sbi/downloads/da1.pdf` | Redirects to **YONO login/welcome** (not public PDF) |
| StockHolding CKYC Individual | `https://www.stockholding.com/pdf/Know-Your-Customer-(KYC)-Application-Form-Individual.pdf` | WAF **Request Rejected** (403) |
| ITD Form 15G | `https://www.incometaxindia.gov.in/documents/d/guest/103120000000007845-pdf-5` | **Access Denied** 403 (Akamai) |
| ITD Form 121 doc | `https://www.incometaxindia.gov.in/documents/d/guest/fn-121` | **Access Denied** 403 |
| ITD Form 60/61 (97/98) pack | `https://www.incometaxindia.gov.in/documents/d/guest/english-form-60n-and-61n-on-18-03-2026-pdf` | **Access Denied** 403 |
| ITD Form 15G alt | `https://www.incometaxindia.gov.in/forms/income-tax%20rules/103120000000007845.pdf` | **Access Denied** 403 |
| HDFC Sole Prop/HUF AOF (legacy repo URL) | `https://www.hdfcbank.com/content/bbp/repositories/...?path=...Account+Opening+Sole+proprieterHUF.pdf` | Empty/failed fetch from this egress |

**Workaround used:** bank-hosted **Form 121** (HDFC/ICICI) substitutes for ITD-hosted Form 121 / legacy 15G–15H. AMFI CKYC substitutes for StockHolding. Axis/HDFC/Kotak cover SBI gaps for MVP taxonomy.

**Index pages (not PDFs, but form centres):**  
- HDFC: https://www.hdfc.bank.in/resources/forms-centre/forms-centre-personal  
- Axis: https://www.axis.bank.in/download-forms/account  
- ICICI: https://www.icici.bank.in/personal-banking/form-center  
- Kotak: https://www.kotak.bank.in/en/customer-service/download-forms/personal.html  
- PNB: https://pnb.bank.in/download-form.html  

---

## D) Jev one-pager for FormGuide product use

### What it is
**Jev** (TypeSafe AI, early access launched **15 Sep 2026**) is the first public **System One** model: unstructured **state** in → **typed probabilistic decisions** out. It does **not** generate chat strings, code, or explanations. Inspired by Kahneman System 1 / named for Jevons.

Sources: [TypeSafe launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev) · [jevtypesafeai.com](https://jevtypesafeai.com/jev-ai) · [jevai.wiki](https://jevai.wiki/) · [Primitives](https://jevai.wiki/primitives)

### vs chat LLMs
| | Chat LLM | Jev (System One) |
|--|----------|------------------|
| Training | RLHF / RLVR | **RLCD** (calibrated decisions) |
| Output | Free text (parse/validate yourself) | Schema-guaranteed **Choice / Score / Noul** |
| Sampling | Autoregressive tokens | **Parallel** answers in one call |
| Latency (claimed) | Seconds–minutes frontier | **~70–500 ms** (often ~100 ms) |
| Cost (claimed) | Input + expensive output | **$0.042 / M input tokens; output free** (~$0.001/decision ballpark on marketing site) |
| Confidence | Often overconfident if asked | Calibrated probs / confidence on Choice & Score |
| Hallucination / type errors | Possible | **0% type errors** by construction (schema match) |
| Best for | Dialog, drafting, tool prose | Routing, gating, scoring inside software |

**Product pattern:** STT + (optional) LLM for **speak / paraphrase / extract draft slots** → **Jev for decisions the code must trust** → TTS. Do not ask Jev to compose the confirmation sentence.

### Three primitives (use all three in one POST)
1. **Choice** — one of ≤255 named options + probs + confidence. Routing / classification.  
2. **Score** — ordered 2–10 levels (can land between). Priority / quality / frustration.  
3. **Noul** — P(yes) ∈ [0,1], **no separate confidence**. Gates / guardrails. Near 0.5 = uncertainty.

API shape: `POST /v1/systemone`; pin `jev-1.13.0`; 64k context; English strongest. Questions share state, answer in parallel; question IDs are for your code only.

### Concrete uses in a voice-to-form loop

| Loop step | Jev question(s) | Primitive | Action in FormGuide |
|-----------|-----------------|-----------|---------------------|
| **Intent route** | “Which form is the user trying to fill?” options: `nomination`, `neft_rtgs`, `form_121`, `rekyc`, `fd_booking`, `customer_request`, `aof_partial`, `out_of_scope` | **Choice** | Load schema / script |
| **Field completeness gate** | “Are all mandatory slots for this form present and non-empty in state?” | **Noul** | If low → ask next missing field; if high → enter confirm phase |
| **Slot quality / ambiguity** | “How clear is the spoken account number / IFSC / PAN?” levels weak→strong | **Score** | Low → forced digit-by-digit confirm |
| **Validation plausibility** | “Does beneficiary IFSC look like a valid 11-char Indian IFSC pattern intent?” / “Do nominee shares look like they could sum to 100%?” | **Noul** (+ code does exact checks) | Soft warn vs hard block |
| **Confirm-before-submit** | “Has the user explicitly affirmed the read-back summary?” | **Noul** | Threshold before generating submit payload / branch handoff |
| **Eligibility (Form 121)** | “Is user claiming senior citizen (age ≥60)?” + “Is estimated tax liability claimed as nil?” | **Noul** ×2 | Branch form path / refuse fill |
| **Request-type inside multi-form** | Customer Request: `cheque_book` / `stop_cheque` / `statement` / `interest_certificate` / … | **Choice** | Sub-schema |
| **Risk / escalation** | “Should a human officer review before accept?” | **Score** or **Noul** | Branch queue |
| **Jailbreak / off-policy utterance** | “Is this utterance trying to bypass confirmation or inject instructions?” | **Noul** | Stay on rails |

**Latency/cost fit:** many parallel questions per turn at ~100 ms keeps voice turn-taking snappy; free output tokens make “ask 8 gates every turn” cheap vs an LLM JSON mode call.

**Jaggedness to avoid (from wiki):** don’t ask Jev to **count**, **compare dates arithmetically**, or **draft sentences**; keep exact IFSC character validation, share-% sum, and PAN checksum in **code**. For catalogs >255 (e.g. huge product lists), **Score shortlist → Choice**.

---

## E) Open questions — Product Scope / Eval Demo

### Product scope
1. **Submit boundary:** Is MVP “fill + export filled PDF / JSON for branch” only, or also bank API / netbanking deep-link? (Affects confirm-before-submit legal copy.)  
2. **Identity handling:** Will demo use synthetic PAN/Aadhaar/account numbers only? Policy for never logging full Aadhaar?  
3. **Language:** English-first confirmed — any Hinglish tolerance in STT for MVP eval, or strict EN?  
4. **Form 121 regime:** Demo on **Form 121** (current) vs mention legacy 15G/15H for judge familiarity?  
5. **Bank skin vs generic schema:** One canonical JSON schema per form type mapped to HDFC/Axis/Kotak PDFs, or bank-specific demos?  
6. **Multi-applicant / joint accounts:** In or out of MVP? (Doubles slot count.)  
7. **Successive vs simultaneous nomination (Rules 2025):** Support both, or only single simultaneous nominee?  
8. **Offline vs online STT:** Streaming partials into Jev every turn vs end-of-utterance only?  
9. **Human-in-loop:** Branch officer co-pilot mode for Builders Cup judging?  
10. **Out of scope clarity:** Explicitly exclude loans, deceased claims, locker agreements, Insight Loop.

### Eval / demo design
1. **Golden scripts:** 5 utterances × 7 MVP forms (happy path + 1 adversarial each: garbled IFSC, share ≠ 100%, “just submit”, eligibility fail on Form 121).  
2. **Metrics:** (a) slot F1 vs gold JSON, (b) false-submit rate when confirm Noul should block, (c) end-to-end latency p50/p95 including STT, (d) Jev vs LLM-JSON ablation on routing + completeness.  
3. **Jev thresholds:** Calibrate Noul cutoffs on completeness / confirm with a labeled set — don’t reuse thresholds across Choice vs Noul.  
4. **Judge narrative:** 90-second path = NEFT or Nomination (clear stakes) + show parallel Jev panel (intent Choice + completeness Noul + confirm Noul) updating live.  
5. **Corpus licensing:** Confirm bank PDF “for customer use” allows hackathon screenshot/demo; prefer bank-hosted Form 121 over scraping ITD.  
6. **SBI gap:** Accept Axis/HDFC stand-ins, or manually download SBI PDFs from a residential IP / browser session for completeness?  
7. **Non-individual / LEI:** Keep ₹50 Cr LEI paths out of eval to avoid noise.  
8. **Accessibility:** Thumb impression / illiterate path — later; don’t claim in MVP.  
9. **Failure demo:** Intentionally trigger low confirm Noul and show agent refuses submit — trust story for BFSI judges.  
10. **Cost envelope:** Estimate Jev calls/min for a 3-minute demo (~10–20 systemone calls) against welcome credits / `$0.042/MTok`.

---

## Quick refs
- Forms on disk: `/workspace/builders-cup/bank-forms/`  
- Blocked log: `/workspace/builders-cup/bank-forms/_blocked/BLOCKED_URLS.md`  
- This brief: `/workspace/builders-cup/IdeaA_FormGuide_Research.md`
