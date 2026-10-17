import { afterEach, describe, expect, it, vi } from 'vitest';
import { journeyMicMessage, transcribeClip } from './transcribeClip';

describe('journeyMicMessage', () => {
  it('never shows a raw error code', () => {
    for (const code of ['rate_limited', 'transcribe_503', 'bad_wav', 'speak_failed', null]) {
      expect(journeyMicMessage(code)).not.toMatch(/_|rate_limited/);
    }
  });

  it('tells the user to wait when the network hit the limit', () => {
    expect(journeyMicMessage('rate_limited')).toMatch(/wait a minute/i);
  });
});

describe('transcribeClip', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the speak function to detect the language and returns what it heard', async () => {
    let sent: FormData | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: FormData }) => {
        sent = init.body;
        return new Response(JSON.stringify({ transcript: 'എനിക്ക് സേവിംഗ്സ് അക്കൗണ്ട് വേണം', detected_lang: 'ml-IN' }));
      }),
    );
    const out = await transcribeClip(new Blob(['RIFF']), 'en-IN');
    expect(out).toEqual({ transcript: 'എനിക്ക് സേവിംഗ്സ് അക്കൗണ്ട് വേണം', error: null, detected: 'ml-IN' });
    expect((sent as FormData | null)?.get('detect_language')).toBe('1');
  });

  it('reports no language when the server could not tell, or named one we do not offer', async () => {
    for (const detected_lang of [null, 'ta-IN']) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ transcript: 'hello', detected_lang }))));
      expect((await transcribeClip(new Blob(['RIFF']), 'en-IN')).detected).toBeNull();
    }
  });
});
