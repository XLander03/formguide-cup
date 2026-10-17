import { MAX_PDF_PAGES } from '../../../shared/forms/limits';
import { firebaseWebConfig } from './firebaseConfig';

async function adminToken(unavailable: string): Promise<string> {
  const config = firebaseWebConfig();
  if (!config) throw new Error(unavailable);

  const { initializeApp, getApps } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const app = getApps().length ? getApps()[0] : initializeApp(config);
  const user = getAuth(app).currentUser;
  if (!user) throw new Error('Sign in as the Cup admin first.');
  try {
    // force-refresh: a stale cached token is a common cause of a server-side
    // "unauthenticated" even though the client still thinks it's signed in.
    return await user.getIdToken(true);
  } catch {
    throw new Error('Could not refresh your sign-in — sign out and back in.');
  }
}

export async function adminPost(path: string, body: unknown, unavailable: string): Promise<unknown> {
  const token = await adminToken(unavailable);
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw adminError(payload.error, response.status, unavailable);
  return payload;
}

/** GET with the admin ID token; resolves to the parsed JSON body. */
export async function adminGetJson(path: string, unavailable: string): Promise<unknown> {
  const response = await adminGet(path, unavailable);
  try {
    return await response.json();
  } catch {
    throw new Error(`${unavailable} (bad response)`);
  }
}

/** GET with the admin ID token; resolves to the body as a Blob (e.g. a source PDF). */
export async function adminGetBlob(path: string, unavailable: string): Promise<Blob> {
  const response = await adminGet(path, unavailable);
  return response.blob();
}

async function adminGet(path: string, unavailable: string): Promise<Response> {
  const token = await adminToken(unavailable);
  const response = await fetch(path, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw adminError(payload.error, response.status, unavailable);
  }
  return response;
}

function adminError(error: string | undefined, status: number, unavailable: string): Error {
  if (error === 'admin_required') return new Error('This account cannot publish forms.');
  if (error === 'unauthenticated') return new Error('Your sign-in expired — sign out and back in.');
  if (error === 'unchecked_low_confidence') return new Error('Check every low-confidence field before publishing.');
  if (error === 'pdf_too_large') return new Error('That PDF is too large.');
  if (error === 'pdf_too_many_pages') return new Error(`That PDF has more than ${MAX_PDF_PAGES} pages.`);
  if (error === 'form_too_large') {
    return new Error('That form has too many fields to save as one version. Split the PDF and upload each part.');
  }
  if (error === 'not_found' || (!error && status === 404)) return new Error('That form was not found.');
  // Never swallow an unrecognized server error behind the generic
  // message again — show what the server actually said.
  return new Error(error ? `${unavailable} (${error})` : `${unavailable} (HTTP ${status})`);
}
