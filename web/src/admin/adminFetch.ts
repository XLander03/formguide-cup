import { firebaseWebConfig } from './firebaseConfig';

export async function adminPost(path: string, body: unknown, unavailable: string): Promise<unknown> {
  const config = firebaseWebConfig();
  if (!config) throw new Error(unavailable);

  const { initializeApp, getApps } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const app = getApps().length ? getApps()[0] : initializeApp(config);
  const user = getAuth(app).currentUser;
  if (!user) throw new Error('Sign in as the Cup admin first.');
  const token = await user.getIdToken();
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
    if (payload.error === 'unchecked_low_confidence') {
      throw new Error('Check every low-confidence field before publishing.');
    }
    if (payload.error === 'pdf_too_large') throw new Error('That PDF is too large.');
    throw new Error(unavailable);
  }
  return payload;
}
