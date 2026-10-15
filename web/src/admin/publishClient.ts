import type { FormVersion } from '../../../shared/forms/types';
import { adminPost } from './adminFetch';
import { mockIngestRequested } from './mockQuery';

export const PUBLISH_UNAVAILABLE = 'Publish is not available yet.';

/**
 * Posts the reviewed form to `publishForm`.
 * The server stores those fields, then marks the version published.
 * `?mock=1` resolves without a network call.
 */
export async function publishForm(form: FormVersion): Promise<void> {
  if (mockIngestRequested()) return;
  await adminPost(
    '/api/publishForm',
    { formId: form.formId, version: form.version, form },
    PUBLISH_UNAVAILABLE,
  );
}
