import fullSchema from '../schema/aof_kyc_demo_v1.schema.json';
import type { FormValues } from './types';

/**
 * Local bank-handoff JSON for the speak-page panel and PDF.
 * Built in the browser only — no Gemini call, no live submit,
 * and no image or audio bytes.
 *
 * Field `value` is the string the panel shows and the PDF prints
 * (the PDF uppercases that same string). Empty controls are null,
 * never their placeholder hint.
 *
 * PIN fields and Aadhaar fields are left out of the handoff.
 * Card numbers are only the last 4 digits.
 *
 * `source` is `user-confirmed` once the user edits or confirms a value,
 * otherwise `document` (details taken from a PAN or other document).
 * `pan` is a valid source for a later PAN capture: pass those field keys
 * in `panKeys` and they export as `pan` until the user confirms them.
 */
export const DRAFT_SCHEMA_VERSION = fullSchema.version;

export const DRAFT_STATUS = 'DRAFT · NOT SUBMITTED' as const;

export const FIELD_SOURCES = ['user-confirmed', 'document', 'pan'] as const;

export type FieldSource = (typeof FIELD_SOURCES)[number];

export interface DraftFieldExport {
  key: string;
  value: string | null;
  confidence: number | null;
  source: FieldSource | null;
}

export interface DraftExport {
  journey: string;
  schema_version: string;
  status: typeof DRAFT_STATUS;
  submitted: false;
  exported_at: string;
  fields: DraftFieldExport[];
}

export interface DraftFieldRef {
  id: string | null;
  enumRef?: string;
}

export interface DraftConfidence {
  confidence: number;
  confirmed?: boolean;
}

export interface BuildDraftExportInput<T extends DraftFieldRef = DraftFieldRef> {
  /** Journey name shown on the panel and the PDF. */
  journeyName: string;
  fields: readonly T[];
  values: FormValues;
  confidence: Readonly<Record<string, DraftConfidence | undefined>>;
  /** Same text the panel shows and the PDF prints before uppercasing. */
  shownValue: (field: T, raw: string) => string;
  exportedAt?: Date;
  /**
   * Field keys filled by a future PAN capture.
   * They export with source `pan` until the user confirms the value.
   */
  panKeys?: ReadonlySet<string>;
}

function clampConfidence(score: number): number {
  if (!Number.isFinite(score)) return 1;
  return Math.max(0, Math.min(1, score));
}

/** Provenance for one field. `pan` is unused until a caller passes `panKeys`. */
export function fieldSource(filled: boolean, confirmed: boolean, fromPan: boolean): FieldSource | null {
  if (!filled) return null;
  if (confirmed) return 'user-confirmed';
  if (fromPan) return 'pan';
  return 'document';
}

function textOf(value: FormValues[string]): string {
  return typeof value === 'string' ? value : '';
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Postal PIN and any other PIN field — never part of the handoff. */
export function isPinField(key: string): boolean {
  return /(^|_)pin($|_)/i.test(key) || /pincode/i.test(key);
}

/** Aadhaar consent / number fields — never part of the handoff. */
export function isAadhaarField(key: string): boolean {
  return /aadhaa?r/i.test(key);
}

function isAadhaarOvd(value: FormValues[string]): boolean {
  const text = textOf(value).trim().toLowerCase();
  return text === 'proof_of_possession_of_aadhaar' || text === 'aadhaar';
}

/** 12-digit Aadhaar, with or without spaces. */
export function isAadhaarNumber(value: FormValues[string]): boolean {
  const text = textOf(value);
  const digits = digitsOnly(text);
  if (/•/.test(text) && digits.length > 0 && digits.length <= 4) return true;
  return /^\d{12}$/.test(digits);
}

export function isAadhaarPayloadField(key: string, values: FormValues): boolean {
  return isAadhaarField(key) || isAadhaarDocumentNumber(key, values);
}

function isAadhaarDocumentNumber(key: string, values: FormValues): boolean {
  if (key === 'ovd_poi_number') {
    return isAadhaarOvd(values.ovd_poi_type) || isAadhaarNumber(values.ovd_poi_number);
  }
  if (key === 'ovd_poa_number') {
    const type = values.ovd_poa_same_as_poi === true ? values.ovd_poi_type : values.ovd_poa_type;
    return isAadhaarOvd(type) || isAadhaarNumber(values.ovd_poa_number);
  }
  return false;
}

export function isExcludedHandoffField(key: string, values: FormValues): boolean {
  return isPinField(key) || isAadhaarField(key) || isAadhaarDocumentNumber(key, values);
}

/** Account / card number fields, not document names that merely contain "card". */
export function isCardNumberField(key: string): boolean {
  return (
    key === 'linked_account_last4' ||
    /card_number|debit_card|credit_card|account_number|account_last4/i.test(key)
  );
}

/** Last 4 digits when the whole value is a 13–19 digit card number. */
export function cardLast4(value: string): string | null {
  const compact = value.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(compact)) return null;
  return compact.slice(-4);
}

function applyCardRule(key: string, value: string): string {
  if (isCardNumberField(key)) {
    const digits = digitsOnly(value);
    return digits ? digits.slice(-4) : value;
  }
  return cardLast4(value) ?? value;
}

function shownText<T extends DraftFieldRef>(
  field: T,
  values: FormValues,
  shownValue: (field: T, raw: string) => string,
): string | null {
  if (!field.id) return null;
  const raw = values[field.id];
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const shown = shownValue(field, raw);
  if (typeof shown !== 'string' || shown.trim() === '') return null;
  return applyCardRule(field.id, shown);
}

export function buildDraftExport<T extends DraftFieldRef>(input: BuildDraftExportInput<T>): DraftExport {
  const panKeys = input.panKeys ?? new Set<string>();
  const fields: DraftFieldExport[] = [];
  for (const field of input.fields) {
    if (!field.id || isExcludedHandoffField(field.id, input.values)) continue;
    const value = shownText(field, input.values, input.shownValue);
    const filled = value !== null;
    const recorded = input.confidence[field.id];
    const confirmed = recorded?.confirmed === true;
    fields.push({
      key: field.id,
      value,
      confidence: filled ? clampConfidence(recorded?.confidence ?? 1) : null,
      source: fieldSource(filled, confirmed, panKeys.has(field.id)),
    });
  }
  return {
    journey: input.journeyName,
    schema_version: DRAFT_SCHEMA_VERSION,
    status: DRAFT_STATUS,
    submitted: false,
    exported_at: (input.exportedAt ?? new Date()).toISOString(),
    fields,
  };
}

export function downloadDraftJson(payload: DraftExport): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `FormGuide-draft-NOT-SUBMITTED-${payload.exported_at.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
