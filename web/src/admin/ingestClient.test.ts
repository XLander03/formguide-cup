import { afterEach, describe, expect, it, vi } from 'vitest';
import { INGEST_UNAVAILABLE, ingestForm } from './ingestClient';
import { PUBLISH_UNAVAILABLE, publishForm } from './publishClient';
import { PLACEHOLDER_FORM_ID, placeholderFormVersion } from './placeholderForm';

// "not configured" must hold regardless of whatever VITE_FIREBASE_* happens
// to be set in a dev's local .env (needed for real admin testing) — Vitest
// shares Vite's env loading, so without this the "not configured" case
// below is only accidentally true on a machine with no Firebase config set.
vi.mock('./firebaseConfig', () => ({ firebaseWebConfig: () => null }));

const file = new File(['%PDF'], 'sample.pdf', { type: 'application/pdf' });
const input = {
  file,
  bytes: new Uint8Array([1, 2, 3]),
  bankId: 'HDFC',
  journey: 'rekyc',
  fillable: false,
};

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('ingest and publish wrappers', () => {
  it('uses placeholder data for ?mock=1 and does not require Firebase', async () => {
    window.history.pushState({}, '', '/admin/upload?mock=1');
    const form = await ingestForm(input);
    expect(form.formId).toBe(PLACEHOLDER_FORM_ID);
    expect(form.bankId).toBe('HDFC');
    expect(form.journey).toBe('rekyc');
    expect(form.source).toBe('ocr');
    expect(form.status).toBe('draft');
    expect(form.fields).toHaveLength(12);
    expect(form.pdfPath).toBe('placeholder://two-page');
    await expect(publishForm(form)).resolves.toBeUndefined();
  });

  it('stops with a plain reason when the remote function is not configured', async () => {
    window.history.pushState({}, '', '/admin/upload');
    await expect(ingestForm(input)).rejects.toThrow(INGEST_UNAVAILABLE);
    await expect(
      publishForm(placeholderFormVersion({ bankId: 'HDFC', journey: 'rekyc', fillable: true })),
    ).rejects.toThrow(PUBLISH_UNAVAILABLE);
  });
});
