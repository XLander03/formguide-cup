import { SCHEMA, enumsFor } from './schema';
import type { FormValues, SchemaField } from './types';

const MONTHS: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

const PATTERN_HINT: Record<string, string> = {
  pan_number: 'PAN is 5 letters, 4 digits, then 1 letter, all in capitals (ABCDE1234F).',
  mobile_registered: 'Mobile is 10 digits starting with 6, 7, 8, or 9.',
  addr_current_pin: 'PIN code is 6 digits and cannot start with 0.',
  addr_permanent_pin: 'PIN code is 6 digits and cannot start with 0.',
  linked_account_last4: 'Enter the last 4 digits only.',
};

/** Shape a typed or restored value before it is stored. PAN is always capitals. */
export function normalizeInput(id: string, value: string | boolean | null): string | boolean | null {
  if (typeof value !== 'string') return value;
  if (id === 'pan_number') return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (id === 'mobile_registered') {
    const digits = value.replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  }
  if (id === 'addr_current_pin' || id === 'addr_permanent_pin') return value.replace(/\D/g, '').slice(0, 6);
  if (id === 'linked_account_last4') return value.replace(/\D/g, '').slice(0, 4);
  if (id === 'dob' || id === 'ovd_poi_expiry') return normalizeDate(value);
  if (id === 'email') return value.trim();
  return value;
}

function normalizeDate(value: string): string {
  const trimmed = value.trim().replace(/,/g, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slash = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(trimmed);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  const named = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);
  if (!named) return value;
  const month = MONTHS[named[2].toLowerCase()];
  if (!month) return value;
  return `${named[3]}-${month}-${named[1].padStart(2, '0')}`;
}

function fieldById(id: string): SchemaField | undefined {
  return SCHEMA.fields.find((field) => field.id === id);
}

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function ageYears(born: Date, today = new Date()): number {
  let age = today.getFullYear() - born.getFullYear();
  const month = today.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < born.getDate())) age -= 1;
  return age;
}

/** Format problem for a filled value. Blank stays a "missing" state, not a format error. */
export function fieldIssue(id: string, value: FormValues[string]): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const field = fieldById(id);
  if (!field) return null;
  const rules = field.validation ?? {};
  const text = value;

  if (rules.case === 'upper' && text !== text.toUpperCase()) {
    return 'Write this completely in capitals.';
  }

  if (typeof rules.pattern === 'string') {
    const pattern = new RegExp(rules.pattern);
    if (!pattern.test(text)) return PATTERN_HINT[id] ?? 'This does not match the expected format.';
  }

  if (typeof rules.minLength === 'number' && text.trim().length < rules.minLength) {
    return `Enter at least ${rules.minLength} characters.`;
  }
  if (typeof rules.maxLength === 'number' && text.trim().length > rules.maxLength) {
    return `Keep this to ${rules.maxLength} characters.`;
  }

  if (rules.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return 'Enter an email like name@example.com.';
  }

  if (rules.format === 'YYYY-MM-DD') {
    const date = parseIso(text);
    if (!date) return 'Use a real date, like 15 August 1992 or 1992-08-15.';
    if (typeof rules.age_min_years_demo === 'number') {
      const age = ageYears(date);
      if (age < 0) return 'Date of birth is in the future.';
      if (age < rules.age_min_years_demo) {
        return `This demo is for applicants ${rules.age_min_years_demo} or older.`;
      }
    }
  }

  if (rules.enum === true) {
    const options = enumsFor(field);
    if (options && !options.includes(text)) return 'Pick one of the listed options.';
  }

  if (rules.digits_preferred === true && !/^\d+$/.test(text)) {
    return 'Use digits only.';
  }

  return null;
}

export function invalidFieldIds(values: FormValues): string[] {
  const ids: string[] = [];
  for (const field of SCHEMA.fields) {
    if (fieldIssue(field.id, values[field.id])) ids.push(field.id);
  }
  return ids;
}
