import type { FormValues } from './types';

/** A filled value that a later voice or text turn replaced. */
export interface Correction {
  id: string;
  from: string;
  to: string;
  /** Date.now() when it was seen, so the UI can fade it out. */
  at: number;
}

/** Sources that mean the customer typed or the sample loader wrote the value, not a spoken turn. */
const NOT_VOICE = new Set(['manual']);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** How a stored value reads on screen in a diff: dates as "15 Aug 1992", booleans as Yes/No. */
export function diffText(id: string, value: FormValues[string]): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value !== 'string') return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso && (id === 'dob' || id.endsWith('_expiry') || id.endsWith('_date'))) {
    const month = MONTHS[Number(iso[2]) - 1];
    if (month) return `${Number(iso[3])} ${month} ${iso[1]}`;
  }
  return value.replace(/_/g, ' ');
}

function filled(value: FormValues[string]): value is string | boolean {
  return typeof value === 'boolean' || (typeof value === 'string' && value.trim() !== '');
}

/**
 * Fields a spoken (or typed-into-the-companion) turn changed from one filled value to another.
 * Typing into a field, clearing the draft, or loading the sample draft never counts.
 */
export function findCorrections(
  prev: FormValues,
  next: FormValues,
  source: Record<string, string>,
  said: Record<string, string>,
  now = Date.now(),
): Correction[] {
  const out: Correction[] = [];
  for (const [id, value] of Object.entries(next)) {
    const before = prev[id];
    if (!filled(before) || !filled(value) || before === value) continue;
    if (NOT_VOICE.has(source[id] ?? '') || said[id] === 'Sample draft') continue;
    if (id === 'journey_mode' || id === 'preferred_language' || id === 'account_product_intent') continue;
    const from = diffText(id, before);
    const to = diffText(id, value);
    if (from === to) continue;
    out.push({ id, from, to, at: now });
  }
  return out;
}
