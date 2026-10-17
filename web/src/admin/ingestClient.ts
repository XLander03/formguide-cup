import type { FormVersion } from '../../../shared/forms/types';
import { adminPost } from './adminFetch';
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
 * Called directly, not via the `/api/ingestForm` Hosting rewrite: Hosting
 * cuts proxied function requests off at 60s, and OCR of a flat PDF can run
 * past that (pages are OCR'd concurrently, but one slow page or a retry still
 * sets the pace). The function's own CORS list allows the web.app
 * origin and localhost:5173.
 */
const INGEST_URL =
  import.meta.env.VITE_INGEST_URL?.trim() || 'https://us-central1-faceapp-5397b.cloudfunctions.net/ingestForm';

/**
 * Posts the PDF to the `ingestForm` HTTP function.
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

  const payload = (await adminPost(
    INGEST_URL,
    {
      bankId: input.bankId,
      journey: input.journey,
      pdfBase64: toBase64(input.bytes),
    },
    INGEST_UNAVAILABLE,
  )) as { formVersion?: unknown };
  if (!isFormVersion(payload.formVersion)) throw new Error('Ingest did not return a form.');
  return payload.formVersion;
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
