/**
 * Field + journey model for the "speak-form-ease" (Lovable) UI.
 * Matches the deployed preview at https://speak-form-ease.lovable.app/ —
 * 5 groups / 19 fields, 13 always-required, journeys = account-opening
 * sub-types + kyc_update + rekyc. This is a separate, smaller field
 * vocabulary from aof_kyc_demo_v1 (docs/schema, owned by Researcher) —
 * kept independent on purpose so neither side has to track the other's
 * field ids one-for-one.
 */

export type SfeFieldType = 'string' | 'enum' | 'date';

export interface SfeField {
  id: string;
  label: string;
  group: 'identity' | 'contact' | 'address' | 'proof_of_identity' | 'occupation';
  type: SfeFieldType;
  required: boolean;
  enumValues?: string[];
  sensitive?: boolean; // masked in the said-vs-filled receipt
}

export const SFE_FIELDS: SfeField[] = [
  { id: 'full_name', label: 'Full name', group: 'identity', type: 'string', required: true },
  {
    id: 'father_spouse_name',
    label: "Father's / spouse's name",
    group: 'identity',
    type: 'string',
    required: true,
  },
  { id: 'dob', label: 'Date of birth', group: 'identity', type: 'date', required: true },
  {
    id: 'gender',
    label: 'Gender',
    group: 'identity',
    type: 'enum',
    required: true,
    enumValues: ['female', 'male', 'other'],
  },
  {
    id: 'marital_status',
    label: 'Marital status',
    group: 'identity',
    type: 'enum',
    required: false,
    enumValues: ['single', 'married'],
  },
  { id: 'nationality', label: 'Nationality', group: 'identity', type: 'string', required: false },

  { id: 'mobile', label: 'Mobile number', group: 'contact', type: 'string', required: true },
  { id: 'email', label: 'Email', group: 'contact', type: 'string', required: false },

  {
    id: 'residential_address',
    label: 'Residential address',
    group: 'address',
    type: 'string',
    required: true,
  },
  { id: 'city', label: 'City', group: 'address', type: 'string', required: true },
  { id: 'state', label: 'State', group: 'address', type: 'string', required: true },
  { id: 'pin_code', label: 'PIN code', group: 'address', type: 'string', required: true },

  {
    id: 'document_type',
    label: 'Document type',
    group: 'proof_of_identity',
    type: 'enum',
    required: true,
    enumValues: ['passport', 'voter_id', 'driving_licence'],
  },
  {
    id: 'document_number',
    label: 'Document number',
    group: 'proof_of_identity',
    type: 'string',
    required: true,
    sensitive: true,
  },
  {
    id: 'expiry_date',
    label: 'Expiry date',
    group: 'proof_of_identity',
    type: 'date',
    required: false,
  },
  {
    id: 'pan',
    label: 'PAN',
    group: 'proof_of_identity',
    type: 'string',
    required: true,
    sensitive: true,
  },

  {
    id: 'occupation',
    label: 'Occupation',
    group: 'occupation',
    type: 'enum',
    required: true,
    enumValues: ['salaried', 'self_employed', 'professional', 'student', 'homemaker', 'retired', 'other'],
  },
  {
    id: 'employer_business',
    label: 'Employer / business',
    group: 'occupation',
    type: 'string',
    required: false,
  },
  {
    id: 'annual_income',
    label: 'Annual income',
    group: 'occupation',
    type: 'string',
    required: false,
  },
];

export const SFE_GROUPS = [
  { id: 'identity', title: 'Identity' },
  { id: 'contact', title: 'Contact' },
  { id: 'address', title: 'Address' },
  { id: 'proof_of_identity', title: 'Proof of identity' },
  { id: 'occupation', title: 'Occupation' },
] as const;

export const SFE_ALWAYS_REQUIRED = SFE_FIELDS.filter((f) => f.required).map((f) => f.id);

export type SfeFormValues = Record<string, string | null | undefined>;

export function sfeEmptyValues(): SfeFormValues {
  const v: SfeFormValues = {};
  for (const f of SFE_FIELDS) v[f.id] = '';
  return v;
}

export function sfeIsFilled(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

export function sfeGetMissingRequired(values: SfeFormValues): string[] {
  return SFE_ALWAYS_REQUIRED.filter((id) => !sfeIsFilled(values[id]));
}

export function sfeFieldLabel(id: string): string {
  return SFE_FIELDS.find((f) => f.id === id)?.label ?? id;
}

export function sfeCompleteness(values: SfeFormValues): 'empty' | 'partial' | 'demo_ready' {
  const anyFilled = SFE_FIELDS.some((f) => sfeIsFilled(values[f.id]));
  if (!anyFilled) return 'empty';
  const missing = sfeGetMissingRequired(values);
  return missing.length === 0 ? 'demo_ready' : 'partial';
}

/** Journey ids matching the UI's "Supported forms" cards. */
export type SfeJourneyId =
  | 'regular_savings'
  | 'salary'
  | 'basic'
  | 'individual_current'
  | 'kyc_update'
  | 'rekyc';

export interface SfeJourney {
  id: SfeJourneyId;
  group: 'account_opening' | 'kyc';
  title: string;
  summary: string;
  keepNearby: string[];
}

export const SFE_JOURNEYS: SfeJourney[] = [
  {
    id: 'regular_savings',
    group: 'account_opening',
    title: 'Regular savings',
    summary: 'Everyday savings account for individuals',
    keepNearby: [
      'Mobile number you can access',
      'Current address with PIN code',
      'One proof of identity (passport, voter ID, driving licence)',
      'PAN card number',
    ],
  },
  {
    id: 'salary',
    group: 'account_opening',
    title: 'Salary account',
    summary: 'Zero-balance account linked to your employer',
    keepNearby: [
      'Mobile number you can access',
      'Current address with PIN code',
      'One proof of identity (passport, voter ID, driving licence)',
      'PAN card number',
      'Employer name',
    ],
  },
  {
    id: 'basic',
    group: 'account_opening',
    title: 'Basic savings',
    summary: 'Simple no-frills savings account',
    keepNearby: [
      'Mobile number you can access',
      'Current address with PIN code',
      'One proof of identity (passport, voter ID, driving licence)',
    ],
  },
  {
    id: 'individual_current',
    group: 'account_opening',
    title: 'Individual current',
    summary: 'Current account for business transactions',
    keepNearby: [
      'Mobile number you can access',
      'Current address with PIN code',
      'One proof of identity (passport, voter ID, driving licence)',
      'PAN card number',
      'Business / occupation details',
    ],
  },
  {
    id: 'kyc_update',
    group: 'kyc',
    title: 'KYC update',
    summary: 'Change address, mobile, or identity details',
    keepNearby: ['Current address with PIN code', 'One proof of identity', 'PAN card number'],
  },
  {
    id: 'rekyc',
    group: 'kyc',
    title: 'Re-KYC',
    summary: 'Periodic re-verification your bank asked for',
    keepNearby: ['Current address with PIN code', 'One proof of identity', 'PAN card number'],
  },
];

/** "Later" journeys shown disabled on the journey picker. */
export const SFE_PARKED_JOURNEYS = [
  'nomination',
  'debit_card_reissue',
  'personal_loan',
  'fixed_deposit',
  'neft_transfer',
];

export function sfeIsJourneyId(value: unknown): value is SfeJourneyId {
  return typeof value === 'string' && SFE_JOURNEYS.some((j) => j.id === value);
}

export function sfeJourneyById(id: SfeJourneyId): SfeJourney {
  const found = SFE_JOURNEYS.find((j) => j.id === id);
  if (!found) throw new Error(`Unknown journey ${id}`);
  return found;
}

/** Sample phrases shown on the journey picker, mapped to the journey they should detect. */
export const SFE_SAMPLE_PHRASES: Array<{ text: string; lang: 'hi' | 'en'; journey: SfeJourneyId }> = [
  { text: 'मुझे अपनी सैलरी के लिए नया अकाउंट खुलवाना है', lang: 'hi', journey: 'salary' },
  {
    text: 'My bank sent a letter saying I need to redo my KYC',
    lang: 'en',
    journey: 'rekyc',
  },
];

export const SFE_BANK_VARIES_COPY = 'Fields vary by bank.';
export const SFE_NO_LIVE_SUBMIT_COPY =
  'Draft only. FormGuide does not connect to CKYC, DigiLocker, or any bank.';
