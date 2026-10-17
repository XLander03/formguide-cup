/**
 * Name-part fields a bank PDF prints as separate cells (First / Middle / Last).
 * Voice never asks for them: each is computed from a full-name value at fill time.
 * Ingest matches labels to these ids; the web fill derives their values here.
 */

export type NamePart = 'first' | 'middle' | 'last';

export type DerivedNameField = {
  id: string;
  /** Shared id holding the full name this part is cut from. */
  from: 'applicant_full_name' | 'father_or_spouse_name';
  part: NamePart;
  label: string;
};

export const DERIVED_NAME_FIELDS: readonly DerivedNameField[] = [
  { id: 'applicant_first_name', from: 'applicant_full_name', part: 'first', label: 'First name' },
  { id: 'applicant_middle_name', from: 'applicant_full_name', part: 'middle', label: 'Middle name' },
  { id: 'applicant_last_name', from: 'applicant_full_name', part: 'last', label: 'Last name' },
  { id: 'father_first_name', from: 'father_or_spouse_name', part: 'first', label: "Father's first name" },
  { id: 'father_middle_name', from: 'father_or_spouse_name', part: 'middle', label: "Father's middle name" },
  { id: 'father_last_name', from: 'father_or_spouse_name', part: 'last', label: "Father's last name" },
];

const BY_ID = new Map(DERIVED_NAME_FIELDS.map((field) => [field.id, field]));

export function isDerivedNameId(id: string): boolean {
  return BY_ID.has(id);
}

/** Salutations a speaker may include; they belong in a Prefix cell, not the first name. */
const SALUTATIONS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'shri', 'shree', 'smt', 'sri', 'kumari', 'km']);

/**
 * First token is the first name, last token the last name, everything between the
 * middle name. A single-token name fills the first name only.
 */
export function splitName(full: string): Record<NamePart, string> {
  const tokens = full.trim().split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && SALUTATIONS.has(tokens[0].toLowerCase().replace(/\.$/, ''))) tokens.shift();
  if (tokens.length === 0) return { first: '', middle: '', last: '' };
  if (tokens.length === 1) return { first: tokens[0], middle: '', last: '' };
  return { first: tokens[0], middle: tokens.slice(1, -1).join(' '), last: tokens[tokens.length - 1] };
}

/** Value for a derived name id from the full-name values, or undefined for other ids. */
export function derivedNameValue(id: string, values: Readonly<Record<string, unknown>>): string | undefined {
  const field = BY_ID.get(id);
  if (!field) return undefined;
  const full = values[field.from];
  return typeof full === 'string' ? splitName(full)[field.part] : '';
}
