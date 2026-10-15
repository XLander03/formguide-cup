/**
 * The only email allowed through the Cup admin gate.
 * The Firebase Auth user is created outside this app.
 */
export const CUP_ADMIN_EMAIL = 'giridharoffl03@gmail.com';

export function isCupAdmin(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === CUP_ADMIN_EMAIL;
}
