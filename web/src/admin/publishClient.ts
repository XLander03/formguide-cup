import type { FormVersion } from '../../../shared/forms/types';
import { firebaseWebConfig } from './firebaseConfig';
import { mockIngestRequested } from './mockQuery';

export const PUBLISH_UNAVAILABLE = 'Publish is not available yet.';

/**
 * Client wrapper around the `publishForm` function that is being built elsewhere.
 * `?mock=1` resolves without a network call.
 */
export async function publishForm(form: FormVersion): Promise<void> {
  if (mockIngestRequested()) return;

  const config = firebaseWebConfig();
  if (!config) throw new Error(PUBLISH_UNAVAILABLE);

  try {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    const call = httpsCallable(getFunctions(app, 'us-central1'), 'publishForm');
    await call({ form });
  } catch {
    throw new Error(PUBLISH_UNAVAILABLE);
  }
}
