import { HDFC_V1_DATA } from './hdfcV1Data';
import type { BoundField, FormVersion, SchemaFieldSnapshot } from './types';

export const HDFC_V1 = HDFC_V1_DATA as FormVersion;

export function boundFields(form: FormVersion = HDFC_V1): BoundField[] {
  return form.fields as BoundField[];
}

export function schemaBoundFields(form: FormVersion = HDFC_V1): BoundField[] {
  return boundFields(form).filter((field) => field.schemaField);
}

export function toSchemaFields(form: FormVersion = HDFC_V1): SchemaFieldSnapshot[] {
  return schemaBoundFields(form).map((field) => field.schemaField as SchemaFieldSnapshot);
}

export function extractFieldIds(form: FormVersion = HDFC_V1): string[] {
  return schemaBoundFields(form).map((field) => field.id);
}

export function schemaFieldIdSet(form: FormVersion = HDFC_V1): Set<string> {
  return new Set(extractFieldIds(form));
}

export function enumMap(form: FormVersion = HDFC_V1): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {};
  for (const field of schemaBoundFields(form)) {
    if (field.options && field.options.length > 0) out[field.id] = field.options;
  }
  return out;
}

export function booleanFieldIds(form: FormVersion = HDFC_V1): string[] {
  return schemaBoundFields(form)
    .filter((field) => field.schemaField?.type === 'boolean')
    .map((field) => field.id);
}

/** Same clause the speak prompt has always sent to the field model. */
export function enumPromptClause(form: FormVersion = HDFC_V1): string {
  const opt = (id: string) => enumMap(form)[id]?.join('|') ?? '';
  return (
    `journey_mode=${opt('journey_mode')}; gender=${opt('gender')}; residential_status=${opt('residential_status')}; ` +
    `ovd_poi_type/ovd_poa_type=${opt('ovd_poi_type')}; account_product_intent=${opt('account_product_intent')}; ` +
    `occupation_bucket=${opt('occupation_bucket')}`
  );
}

export function askRank(id: string, form: FormVersion = HDFC_V1): number {
  const field = form.fields.find((item) => item.id === id);
  return field ? field.order : 999;
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
}

function effectivelyRequired(field: SchemaFieldSnapshot, values: Record<string, unknown>): boolean {
  if (field.required) return true;
  if (!field.required_if) return false;
  return Object.entries(field.required_if).every(([key, expect]) => values[key] === expect);
}

/** Ask-missing ids in FormVersion.order, skipping confirm gates. Same result as the previous priority list. */
export function missingRequiredIds(
  values: Record<string, unknown>,
  form: FormVersion = HDFC_V1,
): string[] {
  const missing: string[] = [];
  for (const field of schemaBoundFields(form)) {
    const schema = field.schemaField;
    if (!schema || schema.group === 'confirm_gates') continue;
    if (!effectivelyRequired(schema, values)) continue;
    if (!isFilled(values[field.id])) missing.push(field.id);
  }
  missing.sort((a, b) => askRank(a, form) - askRank(b, form));
  return missing;
}

/** Aadhaar document numbers stored as last-4 only. */
export function aadhaarPartialFieldIds(form: FormVersion = HDFC_V1): string[] {
  return form.fields
    .filter((field) => field.pii && field.partial?.keep === 'last' && field.partial.count === 4)
    .map((field) => field.id);
}
