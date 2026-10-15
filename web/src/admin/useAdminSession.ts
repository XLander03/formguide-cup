import { useCallback, useEffect, useState } from 'react';
import { isCupAdmin } from './cupAdmin';
import { firebaseWebConfig, type FirebaseWebConfig } from './firebaseConfig';
import { mockIngestRequested } from './mockQuery';
import type { SignInResult } from './AdminLogin';

export type AdminStatus = 'loading' | 'in' | 'out';

async function authFor(config: FirebaseWebConfig) {
  const { initializeApp, getApps } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const app = getApps().length ? getApps()[0] : initializeApp(config);
  return getAuth(app);
}

export function useAdminSession() {
  const [status, setStatus] = useState<AdminStatus>('loading');

  useEffect(() => {
    if (mockIngestRequested()) {
      setStatus('in');
      return;
    }
    const config = firebaseWebConfig();
    if (!config) {
      setStatus('out');
      return;
    }
    let unsubscribe = () => {};
    let cancelled = false;
    void (async () => {
      const { onAuthStateChanged, signOut } = await import('firebase/auth');
      const auth = await authFor(config);
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user && isCupAdmin(user.email)) {
          setStatus('in');
          return;
        }
        if (user) void signOut(auth);
        setStatus('out');
      });
    })().catch(() => {
      if (!cancelled) setStatus('out');
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    const config = firebaseWebConfig();
    if (!config) return { ok: false, reason: 'Admin sign-in is not configured.' };
    try {
      const { signInWithEmailAndPassword, signOut } = await import('firebase/auth');
      const auth = await authFor(config);
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (!isCupAdmin(credential.user.email)) {
        await signOut(auth);
        return { ok: false, reason: 'This account is not the Cup admin.' };
      }
      setStatus('in');
      return { ok: true };
    } catch {
      return { ok: false, reason: 'Wrong email or password.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    const config = firebaseWebConfig();
    if (!config) {
      setStatus('out');
      return;
    }
    try {
      const { signOut: firebaseSignOut } = await import('firebase/auth');
      const auth = await authFor(config);
      await firebaseSignOut(auth);
    } catch {
      // Signed-out locally even if the network call fails.
    }
    setStatus('out');
  }, []);

  return { status, signIn, signOut };
}
