import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CounterStore } from './rateLimit';

/** Same Native database the form catalog uses. Clients never read this collection. */
const DATABASE_ID = 'formguide';

/**
 * One document per key and window, counted inside a transaction.
 * `expiresAt` lets a Firestore TTL policy on `rateLimits` remove old windows.
 */
export function firestoreCounter(): CounterStore {
  return async (key, expiresAt, by) => {
    const delta = by === undefined ? 1 : Math.max(0, Math.floor(by));
    if (getApps().length === 0) initializeApp();
    const db = getFirestore(DATABASE_ID);
    const ref = db.collection('rateLimits').doc(key);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = (snap.exists ? Number(snap.get('count')) || 0 : 0) + delta;
      tx.set(ref, { count, expiresAt });
      return count;
    });
  };
}
