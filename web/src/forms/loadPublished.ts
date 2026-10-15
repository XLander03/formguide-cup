import { HDFC_V1 } from './hdfcV1';
import type { FormVersion } from './types';

export interface LoadPublishedOptions {
  /** Firebase project id. Omit to use the bundled HDFC v1 and skip the network. */
  projectId?: string;
  /**
   * Firestore emulator host, with or without a scheme, e.g. `127.0.0.1:8080`.
   * Live googleapis hosts are ignored so this loader cannot be pointed at production by accident.
   */
  emulatorHost?: string;
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

interface RestDocument {
  name?: string;
  fields?: Record<string, RestValue>;
}

interface RestValue {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  nullValue?: null;
  mapValue?: { fields?: Record<string, RestValue> };
  arrayValue?: { values?: RestValue[] };
}

function documentsRoot(options: LoadPublishedOptions): string | null {
  if (!options.projectId) return null;
  const host = options.emulatorHost?.trim();
  if (host) {
    if (/googleapis\.com/i.test(host)) return null;
    const origin = host.startsWith('http://') || host.startsWith('https://') ? host : `http://${host}`;
    return `${origin.replace(/\/$/, '')}/v1/projects/${options.projectId}/databases/(default)/documents`;
  }
  return `https://firestore.googleapis.com/v1/projects/${options.projectId}/databases/formguide/documents`;
}

function stringField(doc: RestDocument, key: string): string {
  const value = doc.fields?.[key];
  return typeof value?.stringValue === 'string' ? value.stringValue : '';
}

function asFormVersion(raw: unknown): FormVersion | null {
  if (!raw || typeof raw !== 'object') return null;
  const form = raw as FormVersion;
  if (form.status !== 'published') return null;
  if (!form.formId || !form.version || !Array.isArray(form.fields)) return null;
  return form;
}

async function listDocuments(
  fetchImpl: NonNullable<LoadPublishedOptions['fetchImpl']>,
  url: string,
): Promise<RestDocument[]> {
  const res = await fetchImpl(url);
  if (!res.ok) return [];
  const body = (await res.json()) as { documents?: RestDocument[] };
  return Array.isArray(body.documents) ? body.documents : [];
}

/**
 * Published form versions from Firestore (`forms/{id}/versions/{v}`).
 * With no project id, or if the read fails or nothing is published, returns the bundled HDFC v1.
 * Draft and retired versions are not returned.
 */
export async function loadPublishedFormVersions(
  options: LoadPublishedOptions = {},
): Promise<FormVersion[]> {
  const root = documentsRoot(options);
  if (!root || !options.projectId) return [HDFC_V1];
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    // banks and fieldLibrary are part of the published catalog; versions carry the form.
    await listDocuments(fetchImpl, `${root}/banks`);
    await listDocuments(fetchImpl, `${root}/fieldLibrary`);
    const forms = await listDocuments(fetchImpl, `${root}/forms`);
    const published: FormVersion[] = [];
    for (const formDoc of forms) {
      if (stringField(formDoc, 'status') !== 'published') continue;
      const name = formDoc.name ?? '';
      const formId = name.split('/').pop() || stringField(formDoc, 'formId');
      if (!formId) continue;
      const versions = await listDocuments(fetchImpl, `${root}/forms/${formId}/versions`);
      for (const versionDoc of versions) {
        if (stringField(versionDoc, 'status') !== 'published') continue;
        const parsed = asFormVersion(JSON.parse(stringField(versionDoc, 'payload') || 'null'));
        if (parsed) published.push(parsed);
      }
    }
    return published.length > 0 ? published : [HDFC_V1];
  } catch {
    return [HDFC_V1];
  }
}

export function encodeFirestoreFields(data: Record<string, string | boolean>): Record<string, RestValue> {
  const fields: Record<string, RestValue> = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value };
  }
  return fields;
}
