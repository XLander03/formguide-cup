/**
 * The emails allowed through the Cup admin gate.
 * The Firebase Auth users are created outside this app.
 * Ingest, publish and the console APIs accept these emails on a verified ID token, or an `admin` custom claim.
 */
export const CUP_ADMIN_EMAIL = 'giridharoffl03@gmail.com';

/**
 * A separate test account the build assistant signs in with to check the console end to end.
 * Remove it, and delete the Firebase Auth user, after the Cup.
 */
export const CUP_TEST_ADMIN_EMAIL = 'formguide-test@test.com';

const CUP_ADMIN_EMAILS = new Set([CUP_ADMIN_EMAIL, CUP_TEST_ADMIN_EMAIL]);

export function isCupAdmin(email: string | null | undefined): boolean {
  return CUP_ADMIN_EMAILS.has((email ?? '').trim().toLowerCase());
}
