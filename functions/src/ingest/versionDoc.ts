import type { FormVersion } from '../../../shared/forms/types';
import { IngestError } from './errors';

/**
 * Firestore rejects documents over 1 MiB. A version doc stores the fields twice
 * (the `fields` array and a JSON `payload` copy), roughly 550 bytes per field,
 * so a long scanned form can get close. Stay well under the hard limit.
 */
export const VERSION_DOC_BUDGET = 900_000;

export type VersionDoc = Omit<FormVersion, 'fields'> & {
  fields?: FormVersion['fields'];
  payload: string;
  /** ISO time of the last ingest, publish or status change. Stored beside the form, never inside it. */
  updatedAt?: string;
};

/** A plain FormVersion: no `payload` copy and no `updatedAt` bookkeeping. */
export function strip(value: FormVersion): FormVersion {
  const clean = JSON.parse(JSON.stringify(value)) as FormVersion & { payload?: string; updatedAt?: unknown };
  delete clean.payload;
  delete clean.updatedAt;
  return clean;
}

/** versionDocForWrite plus the time of this write, for the admin console. */
export function versionDocWithTime(version: FormVersion, updatedAt: string): VersionDoc {
  return { ...versionDocForWrite(version), updatedAt };
}

/** `updatedAt` of a stored version doc as an ISO string (string or Firestore Timestamp); null when absent. */
export function updatedAtFromDoc(data: Record<string, unknown> | undefined): string | null {
  const value = data?.updatedAt;
  if (typeof value === 'string') return Number.isNaN(Date.parse(value)) ? null : new Date(value).toISOString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      const date = (value as { toDate(): Date }).toDate();
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function utf8(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/** Firestore storage size of one value (https://firebase.google.com/docs/firestore/storage-size). */
function valueBytes(value: unknown): number {
  if (value === null || value === undefined) return 1;
  if (typeof value === 'boolean') return 1;
  if (typeof value === 'number') return 8;
  if (typeof value === 'string') return utf8(value) + 1;
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + valueBytes(item), 0);
  if (typeof value === 'object') {
    let sum = 0;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      sum += utf8(key) + 1 + valueBytes(item);
    }
    return sum;
  }
  return 8;
}

/** Document size as Firestore counts it: name + fields + 32 bytes overhead. */
export function firestoreDocBytes(data: Record<string, unknown>, docPath: string): number {
  const name = docPath.split('/').reduce((sum, segment) => sum + utf8(segment) + 1, 16);
  return name + valueBytes(data) + 32;
}

/**
 * Firestore also caps a document at 40,000 index entries, and every value inside the
 * `fields` array is indexed (ascending and descending). A dense 20-page form can pass
 * that while still under the byte budget, so the `fields` copy is dropped then as well.
 * The JSON `payload` string adds a handful of entries however long it is.
 */
export const INDEX_ENTRY_BUDGET = 30_000;

function leafValues(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + leafValues(item), 0);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce((sum: number, item) => sum + leafValues(item), 0);
  }
  return value === undefined ? 0 : 1;
}

/** Index entries the `fields` array would cost: two single-field entries per leaf value. */
export function fieldsIndexEntries(fields: FormVersion['fields']): number {
  return leafValues(fields) * 2;
}

export function versionDocPath(version: Pick<FormVersion, 'formId' | 'version'>): string {
  return `forms/${version.formId}/versions/${version.version}`;
}

/**
 * The document to write for a version: fields plus their JSON `payload` copy.
 * When that would pass VERSION_DOC_BUDGET, the `fields` array is left out —
 * every reader can take the fields from `payload` (loadPublished reads only
 * `payload`; see versionFromDoc for the admin side). If even that is too big,
 * the upload fails with `form_too_large` rather than a raw Firestore error.
 */
export function versionDocForWrite(version: FormVersion, budget = VERSION_DOC_BUDGET): VersionDoc {
  const clean = strip(version);
  const doc: VersionDoc = { ...clean, payload: JSON.stringify(clean) };
  const path = versionDocPath(clean);
  if (firestoreDocBytes(doc, path) <= budget && fieldsIndexEntries(clean.fields) <= INDEX_ENTRY_BUDGET) return doc;
  const slim: VersionDoc = { ...doc };
  delete slim.fields;
  const size = firestoreDocBytes(slim, path);
  if (size > budget) {
    throw new IngestError('form_too_large', 413, { fields: clean.fields.length, bytes: size });
  }
  return slim;
}

/**
 * Reads a stored version doc, whether or not it kept the `fields` array.
 * A doc with `fields` reads exactly as before; one without takes them from `payload`.
 */
export function versionFromDoc(data: Record<string, unknown> | undefined): FormVersion | null {
  if (!data) return null;
  const rest: Record<string, unknown> = { ...data };
  delete rest.payload;
  delete rest.updatedAt;
  if (Array.isArray(data.fields) || typeof data.payload !== 'string') return rest as unknown as FormVersion;
  try {
    const parsed = JSON.parse(data.payload) as FormVersion;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.fields)) {
      return { ...rest, fields: parsed.fields } as unknown as FormVersion;
    }
  } catch {
    // Unreadable payload: return the doc as stored and let the caller's validation reject it.
  }
  return rest as unknown as FormVersion;
}
