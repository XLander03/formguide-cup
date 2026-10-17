import { MAX_PDF_PAGES } from '../../../shared/forms/limits';
import { firebaseWebConfig } from './firebaseConfig';

export async function adminPost(path: string, body: unknown, unavailable: string): Promise<unknown> {
  const config = firebaseWebConfig();
  if (!config) throw new Error(unavailable);

  const { initializeApp, getApps } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const app = getApps().length ? getApps()[0] : initializeApp(config);
  const user = getAuth(app).currentUser;
  if (!user) throw new Error('Sign in as the Cup admin first.');
  let token: string;
  try {
    // force-refresh: a stale cached token is a common cause of a server-side
    // "unauthenticated" even though the client still thinks it's signed in.
    token = await user.getIdToken(true);
  } catch {
    throw new Error('Could not refresh your sign-in — sign out and back in.');
  }
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    if (payload.error === 'admin_required') throw new Error('This account cannot publish forms.');
    if (payload.error === 'unauthenticated') throw new Error('Your sign-in expired — sign out and back in.');
    if (payload.error === 'unchecked_low_confidence') {
      throw new Error('Check every low-confidence field before publishing.');
    }
    if (payload.error === 'pdf_too_large') throw new Error('That PDF is too large.');
    if (payload.error === 'pdf_too_many_pages') throw new Error(`That PDF has more than ${MAX_PDF_PAGES} pages.`);
    if (payload.error === 'form_too_large') {
      throw new Error('That form has too many fields to save as one version. Split the PDF and upload each part.');
    }
    // Never swallow an unrecognized server error behind the generic
    // message again — show what the server actually said.
    throw new Error(payload.error ? `${unavailable} (${payload.error})` : `${unavailable} (HTTP ${response.status})`);
  }
  return payload;
}
