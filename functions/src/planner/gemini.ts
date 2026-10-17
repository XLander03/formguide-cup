import type { CallModel, GeminiContent } from './plan';

const API = 'https://generativelanguage.googleapis.com';
/** Same model as the speak field step and ingest OCR. */
export const PLAN_MODEL = 'gemini-3.5-flash-lite';
const RETRIES = 1;
const TIMEOUT_MS = 20_000;

export class PlannerModelError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(code);
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/** generateContent with function declarations. Retries once on 503/429 (flash-lite "high demand"). */
export function geminiCallModel(apiKey: string, fetchImpl: FetchLike = fetch): CallModel {
  return async (body) => {
    const url = `${API}/v1beta/models/${PLAN_MODEL}:generateContent`;
    const init = (): RequestInit => ({
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let res;
    try {
      res = await fetchImpl(url, init());
      for (let attempt = 1; attempt <= RETRIES && (res.status === 503 || res.status === 429); attempt += 1) {
        console.warn('plan_model_retry', attempt, res.status);
        await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        res = await fetchImpl(url, init());
      }
    } catch (err) {
      console.error('plan_model_fetch_failed', err instanceof Error ? err.name : 'unknown');
      throw new PlannerModelError('planner_unavailable', 503);
    }
    if (!res.ok) {
      console.error('plan_model_http', res.status);
      throw new PlannerModelError(
        res.status === 503 || res.status === 429 ? 'planner_busy' : 'planner_failed',
        res.status === 503 || res.status === 429 ? 503 : 502,
      );
    }
    const data = (await res.json()) as { candidates?: Array<{ content?: GeminiContent }> };
    const content = data.candidates?.[0]?.content;
    if (!content || !Array.isArray(content.parts)) return null;
    return { role: 'model', parts: content.parts };
  };
}
