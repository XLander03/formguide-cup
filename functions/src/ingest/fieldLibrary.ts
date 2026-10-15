import type { FieldRecord } from '../../../shared/forms/types';
import { AOF_KYC_SEED } from './aofKycSeed';

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
  father_or_spouse_name: ['father name', 'fathers name', 'spouse name', 'father or spouse'],
  dob: ['dob', 'birth date', 'date of birth'],
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
  ovd_poi_number: ['document number', 'id number'],
  pep_declaration: ['pep', 'politically exposed person', 'politically exposed'],
  customer_id_cif: ['cif', 'customer id'],
  photo_consent: ['photo consent', 'photograph consent'],
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
  };
});

export function libraryById(id: string): LibraryField | undefined {
  return FIELD_LIBRARY.find((field) => field.id === id);
}
