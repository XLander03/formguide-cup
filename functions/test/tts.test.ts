import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { asWav, handleTts, MAX_TTS_CHARS, type TtsReq, type TtsRes } from '../src/tts';
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

  it('wraps raw PCM in a WAV header and leaves a WAV alone', () => {
    const wav = asWav(pcm, 'audio/L16;rate=24000');
    assert.equal(wav.length, pcm.length + 44);
    assert.equal(wav.readUInt32LE(24), 24000);
    assert.equal(asWav(wav, 'audio/wav'), wav);
  });
});
