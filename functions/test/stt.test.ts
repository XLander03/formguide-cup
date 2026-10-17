import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { speakLanguageFromStt, transcribeChirp } from '../src/stt';
import './support';

const wav = Buffer.from('RIFFxxxxWAVE');

describe('stt', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stub(status: number, body: unknown): Array<{ url: string; body: { config: { languageCodes: string[]; model: string } } }> {
    const calls: Array<{ url: string; body: { config: { languageCodes: string[]; model: string } } }> = [];
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
    return calls;
  }

  it('detects the language with "auto" and maps it back to a speak language', async () => {
    const calls = stub(200, {
      results: [
        { alternatives: [{ transcript: 'എന്റെ പേര് അനിൽ കുമാർ.' }], languageCode: 'ml-in' },
        { alternatives: [{ transcript: 'സേവിംഗ്സ് അക്കൗണ്ട് വേണം' }], languageCode: 'ml-in' },
      ],
    });
    const out = await transcribeChirp('tok', 'proj', wav, 'auto');
    assert.deepEqual(out, { transcript: 'എന്റെ പേര് അനിൽ കുമാർ. സേവിംഗ്സ് അക്കൗണ്ട് വേണം', language: 'ml-IN' });
    assert.equal(calls[0].url, 'https://us-speech.googleapis.com/v2/projects/proj/locations/us/recognizers/_:recognize');
    assert.deepEqual(calls[0].body.config.languageCodes, ['auto']);
    assert.equal(calls[0].body.config.model, 'chirp_3');
  });

  it('hints a picked language with Chirp\'s own code, and has none for Sindhi', async () => {
    const calls = stub(200, { results: [{ alternatives: [{ transcript: 'ਮੇਰਾ ਨਾਮ' }] }] });
    assert.deepEqual(await transcribeChirp('tok', 'proj', wav, 'pa-IN'), { transcript: 'ਮੇਰਾ ਨਾਮ', language: 'pa-IN' });
    assert.deepEqual(calls[0].body.config.languageCodes, ['pa-Guru-IN']);
    assert.equal(await transcribeChirp('tok', 'proj', wav, 'sd-Arab-IN'), null);
    assert.equal(calls.length, 1);
  });

  it('returns null when the API is off, nothing was heard, or the call fails', async () => {
    stub(403, { error: { status: 'PERMISSION_DENIED' } });
    assert.equal(await transcribeChirp('tok', 'proj', wav, 'auto'), null);
    stub(200, {});
    assert.equal(await transcribeChirp('tok', 'proj', wav, 'auto'), null);
    globalThis.fetch = (async () => {
      throw new Error('timeout');
    }) as typeof fetch;
    assert.equal(await transcribeChirp('tok', 'proj', wav, 'ml-IN'), null);
  });

  it('maps detected codes, and leaves languages we do not offer as null', () => {
    assert.equal(speakLanguageFromStt('pa-guru-in'), 'pa-IN');
    assert.equal(speakLanguageFromStt('hi-IN'), 'hi-IN');
    assert.equal(speakLanguageFromStt('te'), 'te-IN');
    assert.equal(speakLanguageFromStt('ta-in'), null);
    assert.equal(speakLanguageFromStt(undefined), null);
  });
});
