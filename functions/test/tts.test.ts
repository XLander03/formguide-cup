import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { asWav, handleTts, MAX_TTS_CHARS, resetExhaustedModels, synthesize, ttsDailyCharCap, DEFAULT_TTS_DAILY_CHAR_CAP, type TtsReq, type TtsRes } from '../src/tts';
import './support';

function res() {
  const out = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const r: TtsRes = {
    status(code) {
      out.statusCode = code;
      return r;
    },
    json(payload) {
      out.body = payload;
      return r;
    },
    send(body) {
      out.body = body;
      return r;
    },
    set(name, value) {
      out.headers[name.toLowerCase()] = value;
      return r;
    },
  };
  return { r, out };
}

const req = (query: Record<string, unknown>, method = 'GET'): TtsReq => ({ method, query, header: () => undefined, ip: '1.2.3.4' });
const allow = { counter: async () => 1, apiKey: () => 'k' };
const pcm = Buffer.alloc(4800);

describe('tts', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetExhaustedModels();
  });

  function stubGemini(statuses: number[]): string[] {
    const models: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      models.push(String(url).split('/models/')[1].split(':')[0]);
      const status = statuses.shift() ?? 200;
      if (status !== 200) return new Response('{}', { status });
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    return models;
  }

  it('returns cacheable WAV audio for a Hindi line', async () => {
    stubGemini([]);
    const { r, out } = res();
    await handleTts(req({ lang: 'hi-IN', text: 'कृपया अपना मोबाइल नंबर बताएं।' }), r, allow);
    assert.equal(out.statusCode, 200);
    assert.equal(out.headers['content-type'], 'audio/wav');
    assert.match(out.headers['cache-control'], /s-maxage=/);
    assert.equal((out.body as Buffer).subarray(0, 4).toString('ascii'), 'RIFF');
  });

  it('falls back to the second model on a quota error', async () => {
    const models = stubGemini([429]);
    const { r, out } = res();
    await handleTts(req({ lang: 'te-IN', text: 'పేరు చెప్పండి' }), r, allow);
    assert.equal(out.statusCode, 200);
    assert.deepEqual(models, ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts']);
  });

  it('skips a model that ran out of quota for a while, then tries it again', async () => {
    let clock = 1_000_000;
    const now = () => clock;
    const first = stubGemini([429]);
    await synthesize('k', 'नमस्ते', now);
    assert.deepEqual(first, ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts']);
    const second = stubGemini([]);
    await synthesize('k', 'नमस्ते', now);
    assert.deepEqual(second, ['gemini-3.8-flash-tts']);
    clock += 11 * 60 * 1000;
    const later = stubGemini([]);
    await synthesize('k', 'नमस्ते', now);
    assert.deepEqual(later, ['gemini-3.8-flash-lite-tts']);
  });

  it('refuses English, unknown languages, empty and over-long text, and POST', async () => {
    stubGemini([]);
    for (const [query, method, error] of [
      [{ lang: 'en-IN', text: 'hello' }, 'GET', 'bad_language'],
      [{ lang: 'xx', text: 'hello' }, 'GET', 'bad_language'],
      [{ lang: 'hi-IN', text: '  ' }, 'GET', 'text_required'],
      [{ lang: 'hi-IN', text: 'क'.repeat(MAX_TTS_CHARS + 1) }, 'GET', 'text_too_long'],
      [{ lang: 'hi-IN', text: 'नमस्ते' }, 'POST', 'method_not_allowed'],
    ] as const) {
      const { r, out } = res();
      await handleTts(req(query, method), r, allow);
      assert.deepEqual(out.body, { error }, JSON.stringify(query));
    }
  });

  it('counts against its own per-caller limit, not speak\'s', async () => {
    stubGemini([]);
    const keys: string[] = [];
    const { r, out } = res();
    await handleTts(req({ lang: 'hi-IN', text: 'नमस्ते' }), r, {
      counter: async (key) => {
        keys.push(key);
        return 200; // over speak's 150, under the voice's 600
      },
      apiKey: () => 'k',
    });
    assert.equal(out.statusCode, 200);
    assert.match(keys[0], /^ip_tts_/);
    const blocked = res();
    await handleTts(req({ lang: 'hi-IN', text: 'नमस्ते' }), blocked.r, { counter: async () => 10_000, apiKey: () => 'k' });
    assert.equal(blocked.out.statusCode, 429);
  });

  /** Cloud TTS answers with `chirp` (a status, or 200 with MP3); Gemini answers 200. */
  function stubBoth(chirp: number | 'throw'): { urls: string[]; bodies: unknown[] } {
    const urls: string[] = [];
    const bodies: unknown[] = [];
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      urls.push(String(url));
      if (String(url).startsWith('https://texttospeech.googleapis.com/')) {
        bodies.push(JSON.parse(String(init?.body)));
        if (chirp === 'throw') throw new Error('timeout');
        if (chirp !== 200) return new Response('{"error":{"status":"PERMISSION_DENIED"}}', { status: chirp });
        return new Response(JSON.stringify({ audioContent: Buffer.from('ID3mp3').toString('base64') }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: pcm.toString('base64') } }] } }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    return { urls, bodies };
  }

  const withCloud = { ...allow, cloudToken: async () => 'tok' };
  const isGemini = (url: string) => url.startsWith('https://generativelanguage.googleapis.com/');

  it('speaks a Chirp language with Cloud Text-to-Speech as MP3', async () => {
    const { urls, bodies } = stubBoth(200);
    const { r, out } = res();
    await handleTts(req({ lang: 'te-IN', text: 'పేరు చెప్పండి' }), r, withCloud);
    assert.equal(out.statusCode, 200);
    assert.equal(out.headers['content-type'], 'audio/mpeg');
    assert.equal((out.body as Buffer).toString(), 'ID3mp3');
    assert.equal(urls.filter(isGemini).length, 0);
    assert.deepEqual((bodies[0] as { voice: unknown }).voice, { languageCode: 'te-IN', name: 'te-IN-Chirp3-HD-Kore' });
  });

  it('falls back to Gemini when Cloud Text-to-Speech fails or times out', async () => {
    for (const failure of [403, 500, 'throw'] as const) {
      const { urls } = stubBoth(failure);
      const { r, out } = res();
      await handleTts(req({ lang: 'hi-IN', text: 'नमस्ते' }), r, withCloud);
      assert.equal(out.statusCode, 200, String(failure));
      assert.equal(out.headers['content-type'], 'audio/wav');
      assert.equal(urls.filter(isGemini).length, 1);
    }
  });

  it('sends languages with no Chirp voice, or no token, straight to Gemini', async () => {
    for (const [lang, deps] of [
      ['or-IN', withCloud],
      ['as-IN', withCloud],
      ['sd-Arab-IN', withCloud],
      ['hi-IN', { ...allow, cloudToken: async () => undefined }],
    ] as const) {
      const { urls } = stubBoth(200);
      const { r, out } = res();
      await handleTts(req({ lang, text: 'نالو' }), r, deps);
      assert.equal(out.headers['content-type'], 'audio/wav', lang);
      assert.deepEqual(urls.filter((u) => !isGemini(u)), [], lang);
    }
  });

  it('still speaks with Chirp when the Gemini key is missing', async () => {
    stubBoth(200);
    const { r, out } = res();
    await handleTts(req({ lang: 'mr-IN', text: 'नाव सांगा' }), r, { ...withCloud, apiKey: () => undefined });
    assert.equal(out.statusCode, 200);
    const noKey = res();
    stubBoth(403);
    await handleTts(req({ lang: 'mr-IN', text: 'नाव सांगा' }), noKey.r, { ...withCloud, apiKey: () => undefined });
    assert.deepEqual(noKey.out.body, { error: 'gemini_key_missing' });
  });

  it('speaks with Chirp while the shared daily character count is under the cap', async () => {
    const previous = process.env.TTS_DAILY_CHAR_CAP;
    delete process.env.TTS_DAILY_CHAR_CAP;
    try {
      assert.equal(ttsDailyCharCap(), DEFAULT_TTS_DAILY_CHAR_CAP);
      assert.equal(DEFAULT_TTS_DAILY_CHAR_CAP, 30_000);
      const text = 'పేరు చెప్పండి';
      const { urls } = stubBoth(200);
      const charged: number[] = [];
      const { r, out } = res();
      await handleTts(req({ lang: 'te-IN', text }), r, {
        ...withCloud,
        counter: async (key, _expires, by) => {
          if (key.startsWith('tts_chars_')) {
            charged.push(by ?? 0);
            return by ?? 0;
          }
          return 1;
        },
      });
      assert.equal(out.statusCode, 200);
      assert.equal(out.headers['content-type'], 'audio/mpeg');
      assert.equal(urls.some((url) => url.startsWith('https://texttospeech.googleapis.com/')), true);
      assert.deepEqual(charged, [text.length]);
    } finally {
      if (previous === undefined) delete process.env.TTS_DAILY_CHAR_CAP;
      else process.env.TTS_DAILY_CHAR_CAP = previous;
    }
  });

  it('returns 429 daily_cap and does not call Chirp or Gemini once the UTC-day cap is passed', async () => {
    const previous = process.env.TTS_DAILY_CHAR_CAP;
    delete process.env.TTS_DAILY_CHAR_CAP;
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched += 1;
      return new Response('{}', { status: 500 });
    }) as typeof fetch;
    try {
      const { r, out } = res();
      await handleTts(req({ lang: 'hi-IN', text: 'नमस्ते' }), r, {
        ...withCloud,
        counter: async (key, _expires, by) => (key.startsWith('tts_chars_') ? 30_000 + (by ?? 1) : 1),
      });
      assert.equal(out.statusCode, 429);
      assert.deepEqual(out.body, { error: 'daily_cap' });
      assert.equal(fetched, 0);

      process.env.TTS_DAILY_CHAR_CAP = '4';
      fetched = 0;
      const capped = res();
      await handleTts(req({ lang: 'or-IN', text: 'ନାମ କୁହନ୍ତୁ' }), capped.r, {
        ...withCloud,
        counter: async (key, _expires, by) => (key.startsWith('tts_chars_') ? by ?? 0 : 1),
      });
      assert.equal(capped.out.statusCode, 429);
      assert.deepEqual(capped.out.body, { error: 'daily_cap' });
      assert.equal(fetched, 0);
    } finally {
      if (previous === undefined) delete process.env.TTS_DAILY_CHAR_CAP;
      else process.env.TTS_DAILY_CHAR_CAP = previous;
    }
  });

  it('wraps raw PCM in a WAV header and leaves a WAV alone', () => {
    const wav = asWav(pcm, 'audio/L16;rate=24000');
    assert.equal(wav.length, pcm.length + 44);
    assert.equal(wav.readUInt32LE(24), 24000);
    assert.equal(asWav(wav, 'audio/wav'), wav);
  });
});
