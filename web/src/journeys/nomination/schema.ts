import raw from '../../schema/nomination_savings_demo_v1.schema.json';
import type { FormValues, SchemaField } from '../../lib/types';
import type { UtteranceLang } from '../../lib/utteranceLang';

export interface NominationField extends SchemaField {
  label_hi?: string;
  ask_en?: string;
  ask_hi?: string;
  section?: string;
}

export const NOMINATION_SCHEMA = raw as unknown as {
  title: string;
  fields: NominationField[];
  enums: Record<string, string[]>;
  incomplete_routing: { fallback_priority: string[] };
  example_filled_state: { values: FormValues };
};

const SECTION_TITLE: Record<string, string> = {
  account: 'Account',
  nominee: 'Nominee',
  guardian: 'Guardian',
};

export function nominationSectionTitle(group: string): string {
  return SECTION_TITLE[group] ?? group;
}

export function emptyNominationValues(): FormValues {
  const values: FormValues = {};
  for (const field of NOMINATION_SCHEMA.fields) {
    values[field.id] = field.type === 'boolean' ? null : '';
  }
  return values;
}

export function nominationDemoValues(): FormValues {
  const out = emptyNominationValues();
  for (const [key, value] of Object.entries(NOMINATION_SCHEMA.example_filled_state.values)) {
    if (value === null || value === undefined) out[key] = fieldType(key) === 'boolean' ? null : '';
    else out[key] = value as FormValues[string];
  }
  out.readback_confirmed = false;
  out.draft_only_ack = false;
  out.no_live_submit_ack = false;
  return out;
}

function fieldType(id: string): string {
  return NOMINATION_SCHEMA.fields.find((field) => field.id === id)?.type ?? 'string';
}

export function nominationField(id: string): NominationField | undefined {
  return NOMINATION_SCHEMA.fields.find((field) => field.id === id);
}

export function isNominationApplicable(field: NominationField, values: FormValues): boolean {
  if (!field.required_if) return true;
  return Object.entries(field.required_if).every(([key, expect]) => values[key] === expect);
}

export function isNominationRequired(field: NominationField, values: FormValues): boolean {
  if (field.group === 'confirm_gates') return false;
  if (field.required) return true;
  if (!field.required_if) return false;
  return isNominationApplicable(field, values);
}

export function isNominationFilled(value: FormValues[string]): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
}

export function nominationMissing(values: FormValues): string[] {
  const missing: string[] = [];
  for (const field of NOMINATION_SCHEMA.fields) {
    if (!isNominationRequired(field, values)) continue;
    if (!isNominationFilled(values[field.id])) missing.push(field.id);
  }
  const priority = NOMINATION_SCHEMA.incomplete_routing.fallback_priority;
  missing.sort((a, b) => {
    const ia = priority.indexOf(a);
    const ib = priority.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return missing;
}

export function nominationNextAsk(
  missing: string[],
  lang: UtteranceLang,
): string | null {
  if (missing.length === 0) return null;
  const first = missing[0];
  const field = nominationField(first);
  const en = field?.ask_en || (field ? `Please provide: ${field.label_en}` : `Please fill: ${first}`);
  if (lang === 'en') return en;
  const hi = field?.ask_hi || en;
  if (lang === 'mixed') return `${hi} ${en}`;
  return hi;
}

export function nominationCompleteness(
  values: FormValues,
  missing: string[],
): 'empty' | 'partial_core' | 'demo_ready' | 'full_bank_packet' {
  const filled = NOMINATION_SCHEMA.fields.filter(
    (field) => field.group !== 'confirm_gates' && isNominationFilled(values[field.id]),
  ).length;
  if (filled === 0) return 'empty';
  if (missing.length === 0) {
    return isNominationFilled(values.mobile) ? 'full_bank_packet' : 'demo_ready';
  }
  return 'partial_core';
}

export function requiredNominationIds(values: FormValues): string[] {
  return NOMINATION_SCHEMA.fields.filter((field) => isNominationRequired(field, values)).map((field) => field.id);
}
