# aof_kyc_demo_v1 — companion notes (1 page)

**Schema:** `/workspace/research/aof_kyc_demo_v1.schema.json`  
**Date:** 2026-09-24 (IST) · **Audience:** Notion Handler / Builders Cup voice-to-form MVP  
**Scope:** English-first **AOF + KYC** (resident individual). Confirm-before-submit. **No live bank submit.**

## What this schema is

Reusable field pack for voice fill of **account opening (AO-SB)** and **KYC / Re-KYC (KYC-UPD)** drafts. Groups: `identity`, `address`, `contact`, `account_refs`, `kyc_ovd`, `profile_light`, `confirm_gates`. Gates are **Gemini structured JSON** shaped like Choice / Score / Noul (no live Jev API required).

## Explicit exclusions (stretch later)

Do **not** add to this file: **NEFT/RTGS**, **loans**, **SCSS**, **Form 15G/15H**, **nomination**. Out-of-scope gate: `noul_out_of_scope_excluded_product`.

## Counts

| Metric | Value |
| --- | --- |
| Total fields | **45** |
| Always-required | **22** |
| Conditional (`required_if`) | **11** |
| Sections | **8** |

**Always required:** `journey_mode`, `applicant_full_name`, `dob`, `residential_status`, `pan_available`, `mobile_registered`, `addr_current_line1`, `addr_current_city`, `addr_current_state`, `addr_current_pin`, `addr_permanent_same_as_current`, `ovd_poi_type`, `ovd_poi_number`, `ovd_poa_same_as_poi`, `photo_consent`, `ovd_originals_ack`, `existing_bank_customer`, `pep_declaration`, `tax_resident_india_only`, `readback_confirmed`, `draft_only_ack`, `no_live_submit_ack`.

**Conditional:** PAN vs Form 60; permanent address block; POA if ≠ POI; Aadhaar consent if Aadhaar OVD; CIF if existing customer; `account_product_intent` if AOF.

## Confirm / finalize

1. `score_completeness` ≥ `demo_ready`  
2. TTS read-back → `noul_user_confirmed_readback` ≫ 0.9 + `score_confirmation_clarity` = `clear_yes`  
3. Flags: `readback_confirmed`, `draft_only_ack`, `no_live_submit_ack`  
4. If `noul_requests_live_bank_submit` high → **refuse**; draft only  

## Public hubs to cite (no invented form numbers)

| Bank | Cite as | URL |
| --- | --- | --- |
| HDFC | **Forms Centre — Personal** (AOF Individuals, REKYC) | https://www.hdfc.bank.in/resources/forms-centre/forms-centre-personal |
| SBI | **KYC Documents — Individuals** (+ forms listing for titled AOF PDF) | https://sbi.bank.in/web/personal-banking/information-services/kyc-guidelines/kyc-documents-individuals |
| ICICI | **Personal Banking Form Center** (Customer Information Updation / Re-KYC) | https://www.icici.bank.in/personal-banking/form-center |

**Citation rule:** hub + *titled* PDF/section name only (e.g. “Account Opening Form – For Individuals”). Never invent IDs like `HDFC-AOF-03`. UI copy: **“Fields vary by bank.”**

**OVD set (public):** passport, driving licence, proof of possession of Aadhaar, voter ID, NREGA job card, NPR letter — per SBI KYC hub / RBI KYC practice. Aadhaar optional; alternatives always offered.

## Dry-run persona

`example_filled_state` → **Priya Sharma**, new-to-bank, regular savings AOF styled for HDFC hub fields, DL as OVD, PAN present, draft-ready with all three confirm acks. Demo PAN/mobile are **synthetic**.

## Mapping cheat-sheet

| Schema group | Typical hub surface |
| --- | --- |
| identity + profile_light | HDFC AOF / REKYC; ICICI customer info updation |
| kyc_ovd | SBI KYC Documents Individuals |
| account_refs | Bank-variable CIF / customer ID; product names on AOF hub listings |
| confirm_gates | Product rule (all banks) — not a bank PDF field |
