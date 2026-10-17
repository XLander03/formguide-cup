/**
 * The function's own Google Cloud identity, for Cloud Text-to-Speech and Speech-to-Text.
 * No key or secret: the runtime service account signs the calls, and they bill to this project.
 */

const METADATA = 'http://metadata.google.internal/computeMetadata/v1';

let cachedToken: { token: string; expiresAt: number } | null = null;

/** The service-account token from the metadata server, reused until near expiry. */
export async function metadataToken(): Promise<string | undefined> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  try {
    const res = await fetch(`${METADATA}/instance/service-accounts/default/token`, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return undefined;
    cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 300) * 1000 };
    return data.access_token;
  } catch {
    // Not on Google Cloud (emulator, tests): callers fall back to Gemini.
    return undefined;
  }
}

/** This project's id, from the Functions runtime. */
export function projectId(): string | undefined {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  try {
    return (JSON.parse(process.env.FIREBASE_CONFIG ?? '{}') as { projectId?: string }).projectId;
  } catch {
    return undefined;
  }
}
