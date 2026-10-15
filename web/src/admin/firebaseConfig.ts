export interface FirebaseWebConfig {
  apiKey: string;
  appId: string;
  authDomain: string;
  projectId: string;
}

/** Public project id already recorded in `.firebaserc`. Not a secret. */
const DEFAULT_PROJECT_ID = 'faceapp-5397b';

export function firebaseWebConfig(): FirebaseWebConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim();
  if (!apiKey || !appId) return null;
  return {
    apiKey,
    appId,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || `${DEFAULT_PROJECT_ID}.firebaseapp.com`,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID,
  };
}
