import { HDFC_V1, missingRequiredIds, toSchemaFields } from '../forms/hdfcV1';
import { loadPublishedFormVersions } from '../forms/loadPublished';
import compact from '../schema/aof_kyc_demo_v1.compact.json';
import fullSchema from '../schema/aof_kyc_demo_v1.schema.json';
import type { FormValues, SchemaField } from './types';
import { localizeAsk, type UtteranceLang } from './utteranceLang';

export { HDFC_V1, loadPublishedFormVersions };

const rawSchema = fullSchema as unknown as {
  fields: SchemaField[];
  enums: Record<string, string[]>;
  public_hubs: Array<{ bank: string; cite_as: string; url: string }>;
  example_filled_state: {
    values: FormValues;
    persona: { id: string; label: string; bank_hint: string };
  };
  incomplete_routing: {
    choice_next_ask: { fallback_priority: string[] };
    hints: Array<{
      when_missing?: string[];
      ask_en: string;
      if?: Record<string, unknown>;
      when_score?: string;
      when_excluded_intent?: boolean;
    }>;
  };
};

export const SCHEMA: typeof rawSchema = {
  ...rawSchema,
  fields: toSchemaFields(HDFC_V1) as unknown as SchemaField[],
};

export const COMPACT = compact;

export const FIELD_GROUPS = [
  { id: 'identity', title: 'Identity', blurb: 'Name, DOB, PAN / Form 60, residential status' },
  { id: 'contact', title: 'Contact', blurb: 'Registered mobile and email' },
  { id: 'address', title: 'Address', blurb: 'Current (and permanent if different)' },
  { id: 'kyc_ovd', title: 'KYC / OVD', blurb: 'Proof of identity & address — fields vary by bank' },
  { id: 'account_refs', title: 'Account refs', blurb: 'Product intent, CIF if existing customer' },
  { id: 'profile_light', title: 'Profile', blurb: 'Occupation, PEP, tax residency' },
  { id: 'confirm_gates', title: 'Confirm gates', blurb: 'Read-back + draft-only acknowledgements' },
] as const;

export const BANK_VARIES_COPY = 'Fields vary by bank.';

/** Published banks other than the bundled HDFC form are listed but not filled yet. */
export const NOT_SELECTABLE_COPY = 'Not selectable yet. This demo fills the HDFC form.';

export const ALWAYS_REQUIRED = SCHEMA.fields.filter((f) => f.required).map((f) => f.id);

export function emptyValues(): FormValues {
  const v: FormValues = {};
  for (const f of SCHEMA.fields) {
    if (f.type === 'boolean') v[f.id] = null;
    else v[f.id] = '';
  }
  return v;
}

export function priyaDemoValues(): FormValues {
  const raw = SCHEMA.example_filled_state.values;
  const out: FormValues = emptyValues();
  for (const [k, val] of Object.entries(raw)) {
    if (val === null || val === undefined) out[k] = fType(k) === 'boolean' ? null : '';
    else out[k] = val as FormValues[string];
  }
  // Leave confirm gates for the user to tick after TTS (demo flow)
  out.readback_confirmed = false;
  out.draft_only_ack = false;
  out.no_live_submit_ack = false;
  return out;
}

function fType(id: string): string {
  return SCHEMA.fields.find((f) => f.id === id)?.type ?? 'string';
}

/** Evaluate required_if against current values */
export function isFieldApplicable(field: SchemaField, values: FormValues): boolean {
  if (!field.required_if) return true;
  return Object.entries(field.required_if).every(([k, expect]) => values[k] === expect);
}

export function isEffectivelyRequired(field: SchemaField, values: FormValues): boolean {
  if (field.required) return true;
  if (!field.required_if) return false;
  return isFieldApplicable(field, values);
}

export function isFilled(value: FieldValueLike): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true; // false is a valid answer
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
}

type FieldValueLike = string | boolean | null | undefined;

export function getMissingRequired(values: FormValues): string[] {
  // Order comes from FormVersion.order (the published ask-missing rank).
  return missingRequiredIds(values, HDFC_V1);
}

/** Fake-prefill / review rows: applicable fields, group order, confirm gates omitted. */
export function reviewSections(values: FormValues): Array<{
  id: string;
  title: string;
  fields: SchemaField[];
}> {
  return FIELD_GROUPS.filter((group) => group.id !== 'confirm_gates').map((group) => ({
    id: group.id,
    title: group.title,
    fields: SCHEMA.fields.filter((field) => field.group === group.id && isFieldApplicable(field, values)),
  }));
}

export function getNextAsk(
  missing: string[],
  values: FormValues,
  lang: UtteranceLang = 'en',
): string | null {
  if (missing.length === 0) return null;
  const hints = SCHEMA.incomplete_routing.hints;
  for (const h of hints) {
    if (h.when_excluded_intent || h.when_score) continue;
    if (h.if && !Object.entries(h.if).every(([k, v]) => values[k] === v)) continue;
    if (h.when_missing?.some((id) => missing.includes(id))) {
      return localizeAsk(lang, h.ask_en, h.when_missing[0]);
    }
  }
  const first = missing[0];
  const field = SCHEMA.fields.find((f) => f.id === first);
  const en = field ? `Please provide: ${field.label_en}` : `Please fill: ${first}`;
  return localizeAsk(lang, en, first);
}

export function completenessLevel(
  values: FormValues,
  missing: string[],
): 'empty' | 'partial_core' | 'demo_ready' | 'full_bank_packet' {
  const filled = SCHEMA.fields.filter((f) => isFilled(values[f.id])).length;
  if (filled === 0) return 'empty';
  if (missing.length === 0) {
    const optionalLeft = SCHEMA.fields.filter(
      (f) => f.group !== 'confirm_gates' && !isFilled(values[f.id]) && !isEffectivelyRequired(f, values),
    ).length;
    return optionalLeft <= 2 ? 'full_bank_packet' : 'demo_ready';
  }
  const coreIds = [
    'journey_mode',
    'applicant_full_name',
    'dob',
    'mobile_registered',
    'pan_available',
  ];
  const coreOk = coreIds.every((id) => isFilled(values[id]));
  return coreOk ? 'partial_core' : 'empty';
}

export function fieldLabel(id: string): string {
  return SCHEMA.fields.find((f) => f.id === id)?.label_en ?? id;
}

export function enumsFor(field: SchemaField): string[] | null {
  if (!field.enum_ref) return null;
  return SCHEMA.enums[field.enum_ref] ?? null;
}
