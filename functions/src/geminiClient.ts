/**
 * Shared Gemini REST call used by both the aof_kyc_demo_v1 extractor
 * (index.ts) and the speak-form-ease extractor (sfe/gemini.ts), so the
 * model id and retry/fallback behaviour live in exactly one place.
 *
 * Notes learned the hard way:
 * - gemini-2.0-flash is retired; the API's own 404 points to
 *   gemini-3.8-flash.
 * - The REST responseSchema is a restricted OpenAPI subset and rejects
 *   `additionalProperties` with an HTTP 400 — callers must declare
 *   dynamically-keyed fields as a bare `{ type: 'object' }` and describe
 *   the expected shape in the prompt text instead.
 * - gemini-3.8-flash returns 503 "high demand" fairly often; a cheaper
 *   model is tried next rather than failing straight to the heuristic
 *   fallback.
 */

const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

async function callModel(
  model: string,
  apiKey: string,
  prompt: string,
  responseSchema: unknown,
): Promise<{ ok: true; text: string } | { ok: false; status: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema,
      },
    }),
  });
  if (!res.ok) {
    console.warn(`Gemini HTTP ${res.status} (${model})`, await res.text());
    return { ok: false, status: res.status };
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? { ok: true, text } : { ok: false, status: 200 };
}

/**
 * Calls Gemini with `prompt`/`responseSchema`, retrying once against a
 * lighter-weight fallback model on a transient (5xx) error or a 429
 * (free-tier per-model quota is exhausted independently per model, so the
 * fallback model usually still has headroom). Returns the parsed JSON
 * object, or null if both attempts failed or the response wasn't valid
 * JSON — callers should fall back to their heuristic path.
 */
export async function callGeminiJson<T>(
  apiKey: string,
  prompt: string,
  responseSchema: unknown,
): Promise<T | null> {
  let result = await callModel(PRIMARY_MODEL, apiKey, prompt, responseSchema);
  if (!result.ok && (result.status >= 500 || result.status === 429)) {
    result = await callModel(FALLBACK_MODEL, apiKey, prompt, responseSchema);
  }
  if (!result.ok) return null;
  try {
    return JSON.parse(result.text) as T;
  } catch {
    return null;
  }
}
