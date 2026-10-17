import { onRequest } from 'firebase-functions/v2/https';
import { isSpeakLanguage } from './languages';
import { checkRateLimit, clientKey, type CounterStore, type RateLimitRule } from './rateLimit';
import { firestoreCounter } from './rateLimitStore';

/**
 * Spoken Hindi and regional-language lines, generated on the server.
 *
 * Browser voices are unreliable for these languages: a device without a matching voice,
 * or a voice list that has not loaded yet, reads Hindi with an English voice, which says
 * only the digits and the punctuation. Gemini speech is the same on every device.
 *
 *   GET /api/tts?lang=hi-IN&text=...  -> audio/wav
 *
 * GET, so Firebase Hosting's CDN caches each line: the fixed questions and read-back
 * copy are generated once, and cache hits never reach this function or its rate limit.
 */

export const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'] as const;
export const MAX_TTS_CHARS = 700;
/**
 * Its own bucket, apart from speak's: every Hindi turn speaks one or two lines, and sharing
 * speak's 150 let normal use plus testing lock the voice out, so the page fell back to a
 * browser voice that reads Hindi as digits.
 */
export const TTS_PER_CLIENT: RateLimitRule = { limit: 600, windowMs: 10 * 60 * 1000 };
const VOICE = 'Kore';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

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

/** One line of speech. Tries the fast model, then the full one on a quota or capacity error. */
export async function synthesize(apiKey: string, text: string): Promise<Buffer> {
  let lastStatus = 0;
  for (const model of TTS_MODELS) {
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
  const apiKey = deps.apiKey();
  if (!apiKey) {
    res.status(500).json({ error: 'gemini_key_missing' });
    return;
  }
  try {
    const wav = await synthesize(apiKey, text);
    res.set('Content-Type', 'audio/wav');
    // Same text, same audio: let the CDN keep it for a week.
    res.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.status(200).send(wav);
  } catch (err) {
    const status = (err as { httpStatus?: number }).httpStatus ?? 502;
    console.error('tts_failed', err instanceof Error ? err.message : 'unknown');
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
    });
  },
);
