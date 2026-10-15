import type { FormVersion } from '../../../shared/forms/types';
import { firebaseWebConfig } from './firebaseConfig';
import { mockIngestRequested } from './mockQuery';
import { placeholderFormVersion } from './placeholderForm';

export interface IngestFormInput {
  file: File;
  bytes: Uint8Array;
  bankId: string;
  journey: string;
  fillable: boolean;
}

export const INGEST_UNAVAILABLE = 'Ingest is not available yet.';

/**
 * Client wrapper around the `ingestForm` function that is being built elsewhere.
 * `?mock=1` returns placeholder fields and does not call the network.
 */
export async function ingestForm(input: IngestFormInput): Promise<FormVersion> {
  if (mockIngestRequested()) {
    return placeholderFormVersion({
      bankId: input.bankId,
      journey: input.journey,
      fillable: input.fillable,
    });
  }

  const config = firebaseWebConfig();
  if (!config) throw new Error(INGEST_UNAVAILABLE);

  try {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    const call = httpsCallable(getFunctions(app, 'us-central1'), 'ingestForm');
    const result = await call({
      bankId: input.bankId,
      journey: input.journey,
      fileName: input.file.name,
      source: input.fillable ? 'acroform' : 'ocr',
      pdfBase64: toBase64(input.bytes),
    });
    if (!isFormVersion(result.data)) throw new Error('Ingest did not return a form.');
    return result.data;
  } catch (error) {
    if (error instanceof Error && error.message === 'Ingest did not return a form.') throw error;
    throw new Error(INGEST_UNAVAILABLE);
  }
}

function isFormVersion(value: unknown): value is FormVersion {
  if (!value || typeof value !== 'object') return false;
  const form = value as Partial<FormVersion>;
  return (
    typeof form.formId === 'string' &&
    form.formId.length > 0 &&
    typeof form.version === 'string' &&
    form.version.length > 0 &&
    Array.isArray(form.fields)
  );
}

function toBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunk) {
    const slice = bytes.subarray(index, index + chunk);
    let part = '';
    for (let cursor = 0; cursor < slice.length; cursor += 1) part += String.fromCharCode(slice[cursor]);
    binary += part;
  }
  return btoa(binary);
}
