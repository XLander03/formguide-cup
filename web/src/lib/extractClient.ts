import type { ExtractResponse, FormValues } from './types';
import { heuristicExtract } from './heuristicExtract';

/** Hosting has no extract function. The Vite middleware exists only in dev. */
export function extractEndpointUrls(env: { dev: boolean; functionsUrl: string }): string[] {
  const base = env.functionsUrl.replace(/\/$/, '');
  const urls: string[] = [];
  if (base) urls.push(`${base}/extract`);
  if (env.dev) urls.push('/api/extract');
  return urls;
}

async function tryExtractEndpoint(
  url: string,
  body: unknown,
): Promise<ExtractResponse | null> {
  try {
    // In Vite DEV, a cheap GET health check avoids POSTing into a dead proxy.
    if (import.meta.env.DEV && url.startsWith('/')) {
      try {
        const healthCtrl = new AbortController();
        const healthTimer = setTimeout(() => healthCtrl.abort(), 800);
        const health = await fetch(url, {
          method: 'GET',
          signal: healthCtrl.signal,
        });
        clearTimeout(healthTimer);
        if (!health.ok) return null;
      } catch {
        return null;
      }
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as ExtractResponse;
    if (data && data.field_updates) return data;
  } catch {
    // Silent — fall through to next endpoint / client heuristic.
  }
  return null;
}

/**
 * Try Cloud Function / Vite-dev middleware; fall back to client heuristic.
 * Non-OK responses are ignored quietly (no scary console noise).
 */
export async function extractFields(
  utterance: string,
  current: FormValues,
): Promise<ExtractResponse> {
  const body = {
    utterance,
    text: utterance,
    current_values: current,
  };

  const endpoints = extractEndpointUrls({
    dev: import.meta.env.DEV,
    functionsUrl: import.meta.env.VITE_FUNCTIONS_URL ?? '',
  });

  for (const url of endpoints) {
    const data = await tryExtractEndpoint(url, body);
    if (data) return data;
  }

  return heuristicExtract(utterance, current);
}
