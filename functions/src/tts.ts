import { onRequest } from 'firebase-functions/v2/https';
import { isSpeakLanguage } from './languages';
import { checkRateLimit, clientKey, type CounterStore, type RateLimitRule } from './rateLimit';
import { firestoreCounter } from './rateLimitStore';

/**
 * Spoken Hindi and regional-language lines, generated on the server.
 *
 * Browser voices are unreliable for these languages: a device without a matching voice,
 * or a voice list that has not loaded yet, reads Hindi with an English voice, which says
 * only the digits and the punctuation. Server speech is the same on every device.
 *
 * Cloud Text-to-Speech (Chirp 3 HD) speaks the languages it has: it answers in well under a
 * second, where Gemini speech took 3-7s a line, and its first 1M characters a month are free.
 * Odia, Assamese and Sindhi have no Chirp voice, so they (and any Chirp failure) use Gemini.
 *
 *   GET /api/tts?lang=hi-IN&text=...  -> audio/mpeg (Chirp) or audio/wav (Gemini)
 *
 * GET, so Firebase Hosting's CDN caches each line: the fixed questions and read-back
 * copy are generated once, and cache hits never reach this function or its rate limit.
 */

/**
 * Tried in order. Each model has its own quota on the key, so when the fast one is out
 * (429) the next one still speaks; preview TTS quotas are small and ran out in testing.
 */
export const TTS_MODELS = [
  'gemini-3.8-flash-lite-tts',
  'gemini-3.8-flash-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
] as const;
export const MAX_TTS_CHARS = 700;
/**
 * Its own bucket, apart from speak's: every Hindi turn speaks one or two lines, and sharing
 * speak's 150 let normal use plus testing lock the voice out, so the page fell back to a
 * browser voice that reads Hindi as digits.
 */
export const TTS_PER_CLIENT: RateLimitRule = { limit: 600, windowMs: 10 * 60 * 1000 };
const VOICE = 'Kore';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Chirp 3 HD locales, from https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
 * (pa-IN is Preview there). Same voice as Gemini's, so a fallback line sounds alike.
 */
export const CHIRP_LANGUAGES: ReadonlySet<string> = new Set([
  'hi-IN',
  'bn-IN',
  'mr-IN',
  'te-IN',
  'gu-IN',
  'kn-IN',
  'ml-IN',
  'pa-IN',
]);
const CLOUD_TTS = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const CHIRP_TIMEOUT_MS = 8000;
const METADATA_TOKEN =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

export interface TtsReq {
  method: string;
  query: Record<string, unknown>;
  ip?: string;
  header(name: string): string | undefined;
}

export interface TtsRes {
  status(code: number): TtsRes;
  json(payload: unknown): unknown;
  send(body: Buffer): unknown;
  set(name: string, value: string): unknown;
}

export interface TtsDeps {
  counter: CounterStore;
  apiKey: () => string | undefined;
  /** OAuth token for Cloud Text-to-Speech; undefined skips straight to Gemini. */
  cloudToken?: () => Promise<string | undefined>;
}

export interface Speech {
  audio: Buffer;
  contentType: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** The function's service-account token from the metadata server, reused until near expiry. */
export async function metadataToken(): Promise<string | undefined> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  try {
    const res = await fetch(METADATA_TOKEN, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return undefined;
    cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 300) * 1000 };
    return data.access_token;
  } catch {
    // Not on Google Cloud (emulator, tests): Gemini speaks instead.
    return undefined;
  }
}

/** One line from Chirp 3 HD as MP3, or null so Gemini can try. */
export async function synthesizeChirp(token: string, text: string, lang: string): Promise<Buffer | null> {
  try {
    const res = await fetch(CLOUD_TTS, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: lang, name: `${lang}-Chirp3-HD-${VOICE}` },
        audioConfig: { audioEncoding: 'MP3' },
      }),
      signal: AbortSignal.timeout(CHIRP_TIMEOUT_MS),
    });
    if (!res.ok) {
      // 403 SERVICE_DISABLED means the Text-to-Speech API is not enabled on the project.
      const detail = await res.text().catch(() => '');
      console.warn('tts_chirp_failed', lang, res.status, detail.replace(/\s+/g, ' ').slice(0, 900));
      return null;
    }
    const data = (await res.json()) as { audioContent?: string };
    return data.audioContent ? Buffer.from(data.audioContent, 'base64') : null;
  } catch (err) {
    console.warn('tts_chirp_failed', lang, err instanceof Error ? err.message : 'unknown');
    return null;
  }
}

/** Chirp for the languages it has, Gemini for the rest and whenever Chirp cannot answer. */
export async function speakLine(text: string, lang: string, deps: TtsDeps): Promise<Speech> {
  if (CHIRP_LANGUAGES.has(lang) && deps.cloudToken) {
    const token = await deps.cloudToken();
    const mp3 = token ? await synthesizeChirp(token, text, lang) : null;
    if (mp3) return { audio: mp3, contentType: 'audio/mpeg' };
  }
  const apiKey = deps.apiKey();
  if (!apiKey) throw Object.assign(new Error('gemini_key_missing'), { httpStatus: 500 });
  return { audio: await synthesize(apiKey, text), contentType: 'audio/wav' };
}

/** Gemini returns 24 kHz 16-bit mono PCM, sometimes already wrapped as WAV. */
export function asWav(audio: Buffer, mimeType: string): Buffer {
  if (audio.subarray(0, 4).toString('ascii') === 'RIFF') return audio;
  const rate = Number(/rate=(\d+)/.exec(mimeType)?.[1] ?? 24000);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(36 + audio.length, 4);
  head.write('WAVE', 8, 'ascii');
  head.write('fmt ', 12, 'ascii');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'ascii');
  head.writeUInt32LE(audio.length, 40);
  return Buffer.concat([head, audio]);
}

/** Models that just ran out of quota, skipped until this time so each line does not wait on them. */
const exhaustedUntil = new Map<string, number>();
const EXHAUSTED_MS = 10 * 60 * 1000;

/** For tests. */
export function resetExhaustedModels(): void {
  exhaustedUntil.clear();
}

/** One line of speech: the first model in TTS_MODELS that still has quota. */
export async function synthesize(apiKey: string, text: string, now: () => number = Date.now): Promise<Buffer> {
  let lastStatus = 0;
  const ready = TTS_MODELS.filter((model) => (exhaustedUntil.get(model) ?? 0) <= now());
  // All out: try them all anyway rather than refuse outright.
  for (const model of ready.length > 0 ? ready : TTS_MODELS) {
    const res = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
      }),
    });
    if (!res.ok) {
      lastStatus = res.status;
      // Google's own message says which quota ran out (per minute or per day).
      const detail = await res.text().catch(() => '');
      console.warn('tts_model_failed', model, res.status, detail.replace(/\s+/g, ' ').slice(0, 900));
      if (res.status === 429) exhaustedUntil.set(model, now() + EXHAUSTED_MS);
      // A bad request will not get better on the other model.
      if (res.status === 429 || res.status >= 500) continue;
      break;
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
    };
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (part?.data) return asWav(Buffer.from(part.data, 'base64'), part.mimeType ?? '');
    lastStatus = 502;
  }
  throw Object.assign(new Error(`tts_${lastStatus || 502}`), { httpStatus: lastStatus === 429 ? 429 : 502 });
}

export async function handleTts(req: TtsReq, res: TtsRes, deps: TtsDeps): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const text = typeof req.query.text === 'string' ? req.query.text.replace(/\s+/g, ' ').trim() : '';
  const lang = typeof req.query.lang === 'string' ? req.query.lang : '';
  if (!text || text.length > MAX_TTS_CHARS) {
    res.status(400).json({ error: text ? 'text_too_long' : 'text_required' });
    return;
  }
  // English stays on the device voice, which reads it well and with no wait.
  if (!isSpeakLanguage(lang) || lang === 'en-IN') {
    res.status(400).json({ error: 'bad_language' });
    return;
  }
  const limit = await checkRateLimit(
    deps.counter,
    `tts_${clientKey(req.header('x-forwarded-for'), req.ip)}`,
    Date.now(),
    TTS_PER_CLIENT,
  );
  if (!limit.ok) {
    res.set('Retry-After', String(limit.retryAfterSeconds));
    res.status(429).json({ error: 'rate_limited' });
    return;
  }
  try {
    const speech = await speakLine(text, lang, deps);
    res.set('Content-Type', speech.contentType);
    // Same text, same audio: let the CDN keep it for a week.
    res.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.status(200).send(speech.audio);
  } catch (err) {
    const status = (err as { httpStatus?: number }).httpStatus ?? 502;
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('tts_failed', message);
    if (message === 'gemini_key_missing') {
      res.status(500).json({ error: 'gemini_key_missing' });
      return;
    }
    res.status(status).json({ error: status === 429 ? 'rate_limited' : 'tts_failed' });
  }
}

const counter = firestoreCounter();

export const tts = onRequest(
  {
    region: 'us-central1',
    minInstances: 0,
    maxInstances: 3,
    memory: '256MiB',
    timeoutSeconds: 30,
    concurrency: 4,
    invoker: 'public',
    cors: ['https://faceapp-5397b.web.app'],
    secrets: ['GEMINI_API_KEY'],
  },
  async (req, res) => {
    await handleTts(req as unknown as TtsReq, res as unknown as TtsRes, {
      counter,
      apiKey: () => process.env.GEMINI_API_KEY,
      cloudToken: metadataToken,
    });
  },
);
