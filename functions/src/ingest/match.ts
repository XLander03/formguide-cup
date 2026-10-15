import { FIELD_LIBRARY, type LibraryField } from './fieldLibrary';
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

const IDF = buildIdf(FIELD_LIBRARY);
const LIBRARY_SIZE = FIELD_LIBRARY.length;
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

export type LibraryMatch = { entry: LibraryField | null; score: number };

/**
 * Best shared-id match for a PDF field name or printed label.
 * `used` stops a second widget from taking an id that was already claimed.
 * When nothing is assigned, the returned score is the best candidate, capped
 * below the publish threshold if a strong candidate was already taken.
 */
export function matchLibrary(query: string, used?: ReadonlySet<string>): LibraryMatch {
  const ranked = FIELD_LIBRARY.map((entry, index) => ({
    entry,
    index,
    score: scoreLibraryField(query, entry),
  }));
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  const top = ranked[0]?.score ?? 0;
  const pick = ranked.find(
    (row) => row.score >= MATCH_MIN && row.score >= top - 0.08 && !used?.has(row.entry.id),
  );
  if (!pick) {
    const score = top >= MATCH_MIN ? Math.min(top, UNASSIGNED_CAP) : top;
    return { entry: null, score: roundScore(score) };
  }
  return { entry: pick.entry, score: roundScore(pick.score) };
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
