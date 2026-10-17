import type { FieldType } from '../../../shared/forms/types';
import { MATCH_LIBRARY, type LibraryField } from './fieldLibrary';
import { MATCH_MIN } from './errors';

const STOP = new Set([
  'a', 'an', 'the', 'of', 'or', 'and', 'for', 'to', 'in', 'on', 'as', 'by', 'with',
  'your', 'you', 'do', 'if', 'any', 'this', 'from', 'at', 'is', 'be', 'it', 'that',
  'only', 'not', 'when', 'asked', 'have',
]);

export function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(normalized: string): string[] {
  return normalized.split(' ').filter((token) => token.length > 0 && !STOP.has(token));
}

function buildIdf(library: LibraryField[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const field of library) {
    const bag = new Set<string>();
    for (const phrase of [field.id.replace(/_/g, ' '), field.label, ...field.aliases]) {
      for (const token of tokens(normalize(phrase))) bag.add(token);
    }
    for (const token of bag) df.set(token, (df.get(token) || 0) + 1);
  }
  const n = library.length;
  const idf = new Map<string, number>();
  for (const [token, count] of df) idf.set(token, Math.log((n + 1) / (count + 0.5)));
  return idf;
}

const IDF = buildIdf(MATCH_LIBRARY);
const LIBRARY_SIZE = MATCH_LIBRARY.length;
/** Unassigned strong matches stay under the publish threshold so a human checks them. */
const UNASSIGNED_CAP = 0.79;

function weight(token: string): number {
  return IDF.get(token) ?? Math.log((LIBRARY_SIZE + 1) / 0.5);
}

function fuzzy(query: string, target: string): number {
  if (!query || !target) return 0;
  if (query === target) return 1;
  const qt = tokens(query);
  const tt = tokens(target);
  if (qt.length === 0 || tt.length === 0) return 0;
  const targetTokens = new Set(tt);
  let queryWeight = 0;
  let overlapWeight = 0;
  for (const token of qt) {
    const w = weight(token);
    queryWeight += w;
    if (targetTokens.has(token)) overlapWeight += w;
  }
  if (overlapWeight === 0 || queryWeight === 0) return 0;
  let targetWeight = 0;
  for (const token of tt) targetWeight += weight(token);
  const coverage = overlapWeight / queryWeight;
  const precision = targetWeight === 0 ? 0 : overlapWeight / targetWeight;
  let score = coverage * 0.75 + precision * 0.25;
  if (target.includes(query) && query.length >= 3) {
    score = Math.max(score, Math.min(0.93, 0.75 + (query.length / target.length) * 0.2));
  }
  // Exact id, label, and alias comparisons return earlier. Fuzzy stays below
  // those so a short token like "pan" does not outrank its alias.
  return Math.min(score, 0.94);
}

export function scoreLibraryField(query: string, field: LibraryField): number {
  const normalized = normalize(query);
  if (!normalized) return 0;
  const idPhrase = normalize(field.id.replace(/_/g, ' '));
  if (normalized === idPhrase) return 1;
  if (normalized === normalize(field.label)) return 1;
  for (const alias of field.aliases) {
    if (normalized === normalize(alias)) return 0.97;
  }
  let best = 0;
  const phrases = [idPhrase, normalize(field.label), ...field.aliases.map((alias) => normalize(alias))];
  for (const phrase of phrases) best = Math.max(best, fuzzy(normalized, phrase));
  return best;
}

/**
 * "Name as per PAN Card", "DOB as per ID Proof": the document a value is copied
 * from does not change which value it is, so the qualifier is not scored.
 */
const AS_PER = /\bas per (?:the )?(?:pan card|pan|id proof|identity proof|ovd|aadhaar card|aadhaar|passport|bank records|records|id)\b/g;

function scoringQuery(normalized: string): string {
  return normalized.replace(AS_PER, ' ').replace(/\s+/g, ' ').trim();
}

const ANSWER_WORDS = new Set(['', 'yes', 'no', 'y', 'n', 'na', 'none', 'other', 'others']);

/**
 * A tick box, a date, a phone or an email label only takes an id of the same kind.
 * A yes/no id may still sit in a plain text box (an AcroForm "PEP" text widget).
 */
const STRICT_TYPES = new Set<FieldType>(['checkbox', 'date', 'phone', 'email']);

export function typeFits(entryType: FieldType, hint?: FieldType): boolean {
  if (!hint || hint === entryType) return true;
  if (STRICT_TYPES.has(hint)) return false;
  if (STRICT_TYPES.has(entryType)) return hint === 'text' || (entryType === 'phone' && hint === 'number');
  return true;
}

/** Library guards (needs / rejects / session-only) and the widget type. */
export function ruleAllows(entry: LibraryField, labelTokens: ReadonlySet<string>, hint?: FieldType): boolean {
  const rule = entry.match;
  if (rule?.sessionOnly) return false;
  if (!typeFits(entry.type, hint)) return false;
  if (rule?.rejects?.some((token) => labelTokens.has(token))) return false;
  if (rule?.needs?.some((group) => !group.some((token) => labelTokens.has(token)))) return false;
  return true;
}

/**
 * Key a caller adds to `used` once it assigns `entry`. A repeatable id is claimed per
 * label, so "Name as per PAN First Name" and "Name as per OVD First Name" both fill
 * applicant_first_name, while a second identical "Name* First" (a joint holder) does not.
 */
export function claimKey(entry: LibraryField, query: string): string {
  return entry.match?.repeatable ? `${entry.id}@${normalize(query)}` : entry.id;
}

export type LibraryMatch = { entry: LibraryField | null; score: number; claim: string | null };

export type MatchOptions = {
  /** Widget or OCR type of the box; ids of an incompatible type are never offered. */
  type?: FieldType;
};

/**
 * Best shared-id match for a PDF field name or printed label.
 * `used` holds claim keys (see `claimKey`) and stops a second widget from taking
 * an id that was already claimed.
 * When nothing is assigned, the returned score is the best candidate, capped
 * below the publish threshold if a strong candidate was already taken.
 */
export function matchLibrary(query: string, used?: ReadonlySet<string>, options: MatchOptions = {}): LibraryMatch {
  const normalized = normalize(query);
  const labelTokens = new Set(normalized.split(' '));
  // "Yes" / "No" / "Others" name an answer box, not a field.
  if ([...labelTokens].every((token) => ANSWER_WORDS.has(token))) return { entry: null, score: 0, claim: null };
  const scored = scoringQuery(normalized);
  const ranked = MATCH_LIBRARY.filter((entry) => ruleAllows(entry, labelTokens, options.type)).map((entry, index) => ({
    entry,
    index,
    score: scoreLibraryField(scored, entry),
  }));
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  const top = ranked[0]?.score ?? 0;
  const pick = ranked.find(
    (row) => row.score >= MATCH_MIN && row.score >= top - 0.08 && !used?.has(claimKey(row.entry, query)),
  );
  if (!pick) {
    const score = top >= MATCH_MIN ? Math.min(top, UNASSIGNED_CAP) : top;
    return { entry: null, score: roundScore(score), claim: null };
  }
  return { entry: pick.entry, score: roundScore(pick.score), claim: claimKey(pick.entry, query) };
}

export function roundScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000;
}

export function customId(label: string, used: Set<string>): string {
  const slug = normalize(label).replace(/ /g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
  const base = `custom_${slug || 'field'}`;
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}
