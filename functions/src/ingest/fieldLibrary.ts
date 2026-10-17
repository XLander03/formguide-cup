import type { FieldRecord } from '../../../shared/forms/types';
import { DERIVED_NAME_FIELDS } from '../../../shared/forms/nameParts';
import { AOF_KYC_SEED } from './aofKycSeed';

/**
 * Guards a shared id against labels that only look alike. Tokens are compared after
 * `normalize` (lowercase, apostrophes dropped: "Father's" -> "fathers").
 */
export type MatchRule = {
  /** Every group needs at least one of its tokens in the label. */
  needs?: readonly (readonly string[])[];
  /** Any of these tokens in the label rules the id out. */
  rejects?: readonly string[];
  /** Session metadata (which bank, which branch): never read off a bank's PDF. */
  sessionOnly?: true;
  /**
   * The same person's fact printed in several places (Name as per PAN, Name as per OVD).
   * Several different labels may claim the id; an identical repeated label may not.
   */
  repeatable?: true;
};

export type LibraryField = {
  id: string;
  label: string;
  type: FieldRecord['type'];
  required: boolean;
  pii: boolean;
  section: string;
  options?: string[];
  partial?: { keep: 'last'; count: number };
  maxChars?: number;
  aliases: string[];
  match?: MatchRule;
  /** Computed at fill time from this shared id; voice never asks for it. */
  derivedFrom?: string;
};

/** Identifiers whose values are personal data. Unmatched ingest fields are also pii. */
const PII_IDS = new Set([
  'applicant_full_name',
  'father_or_spouse_name',
  'dob',
  'gender',
  'pan_number',
  'ckyc_number',
  'mobile_registered',
  'email',
  'addr_current_line1',
  'addr_current_line2',
  'addr_current_city',
  'addr_current_state',
  'addr_current_pin',
  'addr_permanent_line1',
  'addr_permanent_city',
  'addr_permanent_state',
  'addr_permanent_pin',
  'ovd_poi_number',
  'ovd_poi_expiry',
  'ovd_poa_number',
  'customer_id_cif',
  'linked_account_last4',
  'pep_declaration',
]);

const PARTIAL: Record<string, { keep: 'last'; count: number }> = {
  linked_account_last4: { keep: 'last', count: 4 },
};

/**
 * Extra phrases a bank PDF might use for a shared id.
 * Exact alias hits score just under a literal id/label match.
 */
const ALIASES: Record<string, readonly string[]> = {
  applicant_full_name: ['full name', 'applicant name', 'name of applicant', 'customer name'],
  father_or_spouse_name: [
    'father name', 'fathers name', 'spouse name', 'spouses name', 'father or spouse', 'husbands name', 'husband name',
  ],
  dob: ['dob', 'birth date', 'date of birth', 'date of birth date of incorporation', 'dob doi'],
  ckyc_number: ['ckyc', 'ckyc id', 'ckyc no', 'ckyc number', 'ckycr number'],
  gender: ['sex'],
  pan_number: ['pan', 'pan no', 'pan number', 'permanent account number'],
  mobile_registered: ['mobile', 'mobile number', 'mobile no', 'phone', 'phone number', 'registered mobile'],
  email: ['email', 'e mail', 'email id', 'email address'],
  addr_current_line1: ['current address', 'residential address', 'address line 1'],
  addr_current_city: ['city', 'town'],
  addr_current_state: ['state'],
  addr_current_pin: ['pin code', 'pincode', 'postal code', 'zip code'],
  addr_permanent_line1: ['permanent address'],
  addr_permanent_city: ['permanent city'],
  addr_permanent_state: ['permanent state'],
  addr_permanent_pin: ['permanent pin', 'permanent pin code', 'permanent pincode'],
  ovd_poi_type: ['proof of identity', 'identity document'],
  ovd_poi_number: ['document number', 'id number', 'id no'],
  pep_declaration: ['pep', 'politically exposed person', 'politically exposed'],
  customer_id_cif: ['cif', 'customer id'],
  photo_consent: ['photo consent', 'photograph consent'],
};

/** Name-part tokens: a label carrying one names a cell, not the whole name. */
const NAME_PART = ['prefix', 'title', 'salutation', 'first', 'middle', 'last', 'surname', 'given'];
const FATHER = ['father', 'fathers', 'spouse', 'spouses', 'husband', 'husbands', 'wife', 'wifes'];
/** Someone other than the applicant. */
const OTHER_PERSON = [
  ...FATHER,
  'mother', 'mothers', 'maiden', 'nominee', 'nominees', 'guardian', 'guardians', 'witness', 'minor', 'minors',
  'joint', 'employer', 'employers', 'official', 'officer', 'emp', 'employee', 'introducer', 'depositor', 'depositors',
];
const NOT_FATHER = OTHER_PERSON.filter((token) => !FATHER.includes(token));
const NUMBERISH = ['number', 'no', 'num', 'id'];

const RULES: Record<string, MatchRule> = {
  applicant_full_name: { needs: [['name']], rejects: [...NAME_PART, ...OTHER_PERSON] },
  father_or_spouse_name: { needs: [FATHER], rejects: [...NAME_PART, ...NOT_FATHER] },
  // A bare "Date" / "Place & Date" is the signing date, not the birth date.
  dob: { needs: [['birth', 'dob', 'born']], rejects: OTHER_PERSON, repeatable: true },
  mobile_registered: { needs: [['mobile', 'phone', 'cell']] },
  pan_number: { rejects: ['name', 'dob', 'birth'] },
  customer_id_cif: { rejects: ['name'] },
  ovd_poi_number: { needs: [NUMBERISH] },
  ovd_poa_number: { needs: [NUMBERISH] },
  tax_resident_india_only: { needs: [['tax']] },
  existing_bank_customer: { needs: [['existing']] },
  bank_hint: { sessionOnly: true },
  branch_hint: { sessionOnly: true },
  readback_confirmed: { sessionOnly: true },
  draft_only_ack: { sessionOnly: true },
  no_live_submit_ack: { sessionOnly: true },
};

const PART_TOKENS: Record<'first' | 'middle' | 'last', string[]> = {
  first: ['first', 'given'],
  middle: ['middle'],
  last: ['last', 'surname'],
};

type SeedField = (typeof AOF_KYC_SEED.fields)[number];

function enumRefOf(field: SeedField): string | undefined {
  return 'enumRef' in field ? field.enumRef : undefined;
}

function maxCharsOf(field: SeedField): number | undefined {
  return 'maxChars' in field ? field.maxChars : undefined;
}

function libraryType(field: SeedField): FieldRecord['type'] {
  if (field.id === 'mobile_registered') return 'phone';
  if (field.id === 'email') return 'email';
  if (field.id === 'addr_current_pin' || field.id === 'addr_permanent_pin') return 'pin';
  if (field.id === 'linked_account_last4') return 'partial';
  if (field.schemaType === 'date') return 'date';
  if (field.schemaType === 'boolean') return 'checkbox';
  if (field.schemaType === 'enum') return 'choice';
  return 'text';
}

const ENUMS = AOF_KYC_SEED.enums as Record<string, readonly string[]>;

export const FIELD_LIBRARY: LibraryField[] = AOF_KYC_SEED.fields.map((field) => {
  const type = libraryType(field);
  const enumRef = enumRefOf(field);
  const options = type === 'choice' && enumRef && ENUMS[enumRef] ? [...ENUMS[enumRef]] : undefined;
  const partial = PARTIAL[field.id];
  const maxChars = maxCharsOf(field);
  return {
    id: field.id,
    label: field.label,
    type,
    required: field.required,
    pii: PII_IDS.has(field.id),
    section: field.group,
    ...(options ? { options } : {}),
    ...(partial ? { partial } : {}),
    ...(typeof maxChars === 'number' ? { maxChars } : {}),
    aliases: [...(ALIASES[field.id] ?? [])],
    ...(RULES[field.id] ? { match: RULES[field.id] } : {}),
  };
});

/**
 * Name-part cells (First / Middle / Last). Values come from the full name at fill
 * time (shared/forms/nameParts.ts), so voice never asks for them.
 */
export const DERIVED_LIBRARY: LibraryField[] = DERIVED_NAME_FIELDS.map((field) => {
  const applicant = field.from === 'applicant_full_name';
  const part = field.part;
  return {
    id: field.id,
    label: field.label,
    type: 'text',
    required: false,
    pii: true,
    section: 'identity',
    aliases: applicant
      ? [`${part} name`, `name ${part}`, `customer name ${part} name`, `applicant ${part} name`]
      : [`fathers ${part} name`, `fathers name ${part} name`, `father ${part} name`],
    match: {
      needs: applicant ? [PART_TOKENS[part]] : [['father', 'fathers'], PART_TOKENS[part]],
      rejects: applicant ? OTHER_PERSON : NOT_FATHER,
      repeatable: true,
    },
    derivedFrom: field.from,
  };
});

/** Every id a printed label may map to. */
export const MATCH_LIBRARY: LibraryField[] = [...FIELD_LIBRARY, ...DERIVED_LIBRARY];

export function libraryById(id: string): LibraryField | undefined {
  return MATCH_LIBRARY.find((field) => field.id === id);
}
