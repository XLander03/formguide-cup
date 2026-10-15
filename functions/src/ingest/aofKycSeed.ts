/* Seeded from web/src/schema/aof_kyc_demo_v1.schema.json field ids and labels.
   The ingest runtime does not import schema.ts. */
export const AOF_KYC_SEED = {
  "fields": [
    {
      "id": "journey_mode",
      "label": "What do you want to do?",
      "schemaType": "enum",
      "required": true,
      "group": "identity",
      "enumRef": "journey_mode"
    },
    {
      "id": "applicant_full_name",
      "label": "Full name (as in bank / OVD)",
      "schemaType": "string",
      "required": true,
      "group": "identity",
      "maxChars": 120
    },
    {
      "id": "father_or_spouse_name",
      "label": "Father's / Spouse's name",
      "schemaType": "string",
      "required": false,
      "group": "identity",
      "maxChars": 120
    },
    {
      "id": "dob",
      "label": "Date of birth",
      "schemaType": "date",
      "required": true,
      "group": "identity"
    },
    {
      "id": "gender",
      "label": "Gender",
      "schemaType": "enum",
      "required": false,
      "group": "identity",
      "enumRef": "gender"
    },
    {
      "id": "nationality",
      "label": "Nationality",
      "schemaType": "string",
      "required": false,
      "group": "identity"
    },
    {
      "id": "residential_status",
      "label": "Residential status",
      "schemaType": "enum",
      "required": true,
      "group": "identity",
      "enumRef": "residential_status"
    },
    {
      "id": "pan_available",
      "label": "Do you have a PAN?",
      "schemaType": "boolean",
      "required": true,
      "group": "identity"
    },
    {
      "id": "pan_number",
      "label": "PAN number",
      "schemaType": "string",
      "required": false,
      "group": "identity"
    },
    {
      "id": "form60_declared",
      "label": "Form 60 declaration (no PAN)",
      "schemaType": "boolean",
      "required": false,
      "group": "identity"
    },
    {
      "id": "ckyc_number",
      "label": "CKYC / CKYCR number (if any)",
      "schemaType": "string",
      "required": false,
      "group": "identity",
      "maxChars": 20
    },
    {
      "id": "mobile_registered",
      "label": "Registered mobile number",
      "schemaType": "string",
      "required": true,
      "group": "contact"
    },
    {
      "id": "email",
      "label": "Email address",
      "schemaType": "string",
      "required": false,
      "group": "contact"
    },
    {
      "id": "preferred_language",
      "label": "Preferred communication language",
      "schemaType": "string",
      "required": false,
      "group": "contact"
    },
    {
      "id": "addr_current_line1",
      "label": "Current address — line 1",
      "schemaType": "string",
      "required": true,
      "group": "address",
      "maxChars": 120
    },
    {
      "id": "addr_current_line2",
      "label": "Current address — line 2",
      "schemaType": "string",
      "required": false,
      "group": "address",
      "maxChars": 120
    },
    {
      "id": "addr_current_city",
      "label": "Current city / town",
      "schemaType": "string",
      "required": true,
      "group": "address",
      "maxChars": 60
    },
    {
      "id": "addr_current_state",
      "label": "Current state / UT",
      "schemaType": "string",
      "required": true,
      "group": "address",
      "maxChars": 60
    },
    {
      "id": "addr_current_pin",
      "label": "Current PIN code",
      "schemaType": "string",
      "required": true,
      "group": "address"
    },
    {
      "id": "addr_permanent_same_as_current",
      "label": "Permanent address same as current?",
      "schemaType": "boolean",
      "required": true,
      "group": "address"
    },
    {
      "id": "addr_permanent_line1",
      "label": "Permanent address — line 1",
      "schemaType": "string",
      "required": false,
      "group": "address",
      "maxChars": 120
    },
    {
      "id": "addr_permanent_city",
      "label": "Permanent city / town",
      "schemaType": "string",
      "required": false,
      "group": "address",
      "maxChars": 60
    },
    {
      "id": "addr_permanent_state",
      "label": "Permanent state / UT",
      "schemaType": "string",
      "required": false,
      "group": "address",
      "maxChars": 60
    },
    {
      "id": "addr_permanent_pin",
      "label": "Permanent PIN code",
      "schemaType": "string",
      "required": false,
      "group": "address"
    },
    {
      "id": "ovd_poi_type",
      "label": "Proof of identity — OVD type",
      "schemaType": "enum",
      "required": true,
      "group": "kyc_ovd",
      "enumRef": "ovd_type"
    },
    {
      "id": "ovd_poi_number",
      "label": "Proof of identity — document number",
      "schemaType": "string",
      "required": true,
      "group": "kyc_ovd",
      "maxChars": 30
    },
    {
      "id": "ovd_poi_expiry",
      "label": "Proof of identity — expiry (if any)",
      "schemaType": "date",
      "required": false,
      "group": "kyc_ovd"
    },
    {
      "id": "ovd_poa_same_as_poi",
      "label": "Same OVD for address proof?",
      "schemaType": "boolean",
      "required": true,
      "group": "kyc_ovd"
    },
    {
      "id": "ovd_poa_type",
      "label": "Proof of address — OVD type",
      "schemaType": "enum",
      "required": false,
      "group": "kyc_ovd",
      "enumRef": "ovd_type"
    },
    {
      "id": "ovd_poa_number",
      "label": "Proof of address — document number",
      "schemaType": "string",
      "required": false,
      "group": "kyc_ovd",
      "maxChars": 30
    },
    {
      "id": "aadhaar_voluntary_consent",
      "label": "Voluntary Aadhaar / e-KYC consent (if using Aadhaar OVD)",
      "schemaType": "boolean",
      "required": false,
      "group": "kyc_ovd"
    },
    {
      "id": "photo_consent",
      "label": "Photograph / image capture consent",
      "schemaType": "boolean",
      "required": true,
      "group": "kyc_ovd"
    },
    {
      "id": "ovd_originals_ack",
      "label": "I will produce original OVD for verification when asked",
      "schemaType": "boolean",
      "required": true,
      "group": "kyc_ovd"
    },
    {
      "id": "existing_bank_customer",
      "label": "Existing customer of this bank?",
      "schemaType": "boolean",
      "required": true,
      "group": "account_refs"
    },
    {
      "id": "customer_id_cif",
      "label": "Customer ID / CIF (if existing)",
      "schemaType": "string",
      "required": false,
      "group": "account_refs",
      "maxChars": 20
    },
    {
      "id": "linked_account_last4",
      "label": "Existing account number (last 4 only, optional)",
      "schemaType": "string",
      "required": false,
      "group": "account_refs"
    },
    {
      "id": "account_product_intent",
      "label": "Account product intent (AOF)",
      "schemaType": "enum",
      "required": false,
      "group": "account_refs",
      "enumRef": "account_product_intent"
    },
    {
      "id": "branch_hint",
      "label": "Preferred branch / city for banking (optional)",
      "schemaType": "string",
      "required": false,
      "group": "account_refs",
      "maxChars": 80
    },
    {
      "id": "occupation_bucket",
      "label": "Occupation",
      "schemaType": "enum",
      "required": false,
      "group": "profile_light",
      "enumRef": "occupation_bucket"
    },
    {
      "id": "pep_declaration",
      "label": "Are you a Politically Exposed Person (PEP)?",
      "schemaType": "boolean",
      "required": true,
      "group": "profile_light"
    },
    {
      "id": "tax_resident_india_only",
      "label": "Tax resident of India only (no other country)",
      "schemaType": "boolean",
      "required": true,
      "group": "profile_light"
    },
    {
      "id": "bank_hint",
      "label": "Bank this draft is styled for (demo)",
      "schemaType": "string",
      "required": false,
      "group": "account_refs"
    },
    {
      "id": "readback_confirmed",
      "label": "I confirm the read-back of key details is correct",
      "schemaType": "boolean",
      "required": true,
      "group": "confirm_gates"
    },
    {
      "id": "draft_only_ack",
      "label": "I understand this creates a draft only — not submitted to any bank",
      "schemaType": "boolean",
      "required": true,
      "group": "confirm_gates"
    },
    {
      "id": "no_live_submit_ack",
      "label": "I am not asking the agent to send this to the bank live",
      "schemaType": "boolean",
      "required": true,
      "group": "confirm_gates"
    }
  ],
  "enums": {
    "journey_mode": [
      "account_opening",
      "kyc_update",
      "rekyc"
    ],
    "gender": [
      "female",
      "male",
      "other",
      "prefer_not_to_say"
    ],
    "residential_status": [
      "resident_individual"
    ],
    "ovd_type": [
      "passport",
      "driving_licence",
      "proof_of_possession_of_aadhaar",
      "voter_id",
      "nrega_job_card",
      "npr_letter"
    ],
    "account_product_intent": [
      "regular_savings",
      "salary_savings",
      "bsbda",
      "individual_current",
      "unspecified_varies_by_bank"
    ],
    "occupation_bucket": [
      "salaried",
      "self_employed",
      "professional",
      "student",
      "homemaker",
      "retired",
      "other"
    ]
  }
} as const;
