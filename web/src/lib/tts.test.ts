import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveReadbackVoice } from './languages';
import { isSpeaking, speak, speakForUtterance, speechChunks, stopSpeaking } from './tts';

const voice = (name: string, lang: string, isDefault = false) =>
  ({ name, lang, default: isDefault, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

/** This Mac's Chrome: default voice is English (India), Hindi is installed but not default. */
const MAC_VOICES = [voice('Rishi', 'en-IN', true), voice('Lekha', 'hi-IN'), voice('Geeta', 'te-IN')];

let deviceSpoken: Array<{ text: string; lang: string; voice: string | null }> = [];
let played: string[] = [];
let ttsRequests: string[] = [];
let ttsOk = true;
/** Status codes to answer before succeeding, for the retry test. */
let ttsFailFirst: number[] = [];
/** JSON error on a failing response. A 429 daily_cap must not retry. */
let ttsError = 'rate_limited';
/** While true, server audio "plays" until stopSpeaking pauses it. */
let holdAudio = false;

function installSpeech(voices: SpeechSynthesisVoice[]) {
  class Utterance {
    text: string;
    lang = '';
    voice: SpeechSynthesisVoice | null = null;
    rate = 1;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => voices,
    cancel: () => {},
    speaking: false,
    pending: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    speak: (u: Utterance) => {
      deviceSpoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name ?? null });
      u.onend?.();
    },
  });
}

class FakeAudio {
  paused = true;
  ended = false;
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) {}
  play() {
    this.paused = false;
    played.push(this.src);
    queueMicrotask(() => {
      this.onplaying?.();
      if (!holdAudio) {
        this.paused = true;
        this.ended = true;
        this.onended?.();
      }
    });
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

beforeEach(() => {
  deviceSpoken = [];
  played = [];
  ttsRequests = [];
  ttsOk = true;
  ttsFailFirst = [];
  ttsError = 'rate_limited';
  holdAudio = false;
  installSpeech(MAC_VOICES);
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: () => `blob:${ttsRequests.length}`, revokeObjectURL: () => {} }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      ttsRequests.push(decodeURIComponent(url));
      const failNow = ttsFailFirst.shift();
      if (failNow) return new Response(JSON.stringify({ error: ttsError }), { status: failNow, headers: { 'content-type': 'application/json' } });
      if (!ttsOk) return new Response('{"error":"tts_failed"}', { status: 502, headers: { 'content-type': 'application/json' } });
      return new Response(new Blob(['RIFF']), { status: 200, headers: { 'content-type': 'audio/wav' } });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('speak', () => {
  it('Hindi is spoken by the server voice, never handed to a device voice', async () => {
    await speak('आपकी जन्म तिथि क्या है? जैसे 12 मार्च 1994।', 'hi-IN');
    expect(ttsRequests).toHaveLength(1);
    expect(ttsRequests[0]).toContain('/api/tts?v=chirp3&lang=hi-IN&text=आपकी जन्म तिथि');
    expect(played).toHaveLength(1);
    expect(deviceSpoken).toEqual([]);
  });

  it('a repeated line is played from the cache', async () => {
    await speak('नमस्ते! अपना पूरा नाम बताइए।', 'hi-IN');
    await speak('नमस्ते! अपना पूरा नाम बताइए।', 'hi-IN');
    expect(ttsRequests).toHaveLength(1);
    expect(played).toHaveLength(2);
  });

  it('when the server voice fails, Hindi falls back to the device Hindi voice, not the default English one', async () => {
    ttsOk = false;
    await speak('कृपया अपना 10 अंकों का मोबाइल नंबर बताएं।', 'hi-IN');
    expect(deviceSpoken).toEqual([{ text: expect.any(String), lang: 'hi-IN', voice: 'Lekha' }]);
  });

  it('retries the server voice once after a quota error, then plays it', async () => {
    ttsFailFirst = [429];
    await speak('कृपया अपना पूरा नाम बताइए।', 'hi-IN');
    expect(ttsRequests).toHaveLength(2);
    expect(played).toHaveLength(1);
    expect(deviceSpoken).toEqual([]);
  });

  it('a daily character cap falls back to the device voice without retrying', async () => {
    ttsError = 'daily_cap';
    ttsFailFirst = [429];
    const onError = vi.fn();
    await speak('सीमा पूरी हो गई।', 'hi-IN', { onError });
    expect(ttsRequests).toHaveLength(1);
    expect(played).toEqual([]);
    expect(deviceSpoken).toEqual([{ text: 'सीमा पूरी हो गई।', lang: 'hi-IN', voice: 'Lekha' }]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('?flags=1&ttscap=1 uses the device voice and does not call the server', async () => {
    window.history.pushState({}, '', '/speak?flags=1&ttscap=1');
    const onError = vi.fn();
    await speak('दैनिक सीमा की परीक्षा।', 'hi-IN', { onError });
    expect(ttsRequests).toEqual([]);
    expect(deviceSpoken).toEqual([{ text: 'दैनिक सीमा की परीक्षा।', lang: 'hi-IN', voice: 'Lekha' }]);
    expect(onError).not.toHaveBeenCalled();
    window.history.pushState({}, '', '/speak');
  });

  it('ttscap=1 does nothing unless flags=1 is also set', async () => {
    window.history.pushState({}, '', '/speak?ttscap=1');
    await speak('बिना झंडे के।', 'hi-IN');
    expect(ttsRequests).toHaveLength(1);
    expect(deviceSpoken).toEqual([]);
    window.history.pushState({}, '', '/?flags=1');
    await speak('झंडा अकेला।', 'hi-IN');
    expect(ttsRequests).toHaveLength(2);
    expect(deviceSpoken).toEqual([]);
    window.history.pushState({}, '', '/speak');
  });

  it('when the server voice fails and the browser has no Hindi voice, it stays silent rather than read digits', async () => {
    ttsOk = false;
    installSpeech([voice('Rishi', 'en-IN', true)]);
    const onError = vi.fn();
    await speak('कृपया अपना 10 अंकों का मोबाइल नंबर बताएं।', 'hi-IN', { onError });
    expect(deviceSpoken).toEqual([]);
    expect(onError).toHaveBeenCalledWith('no_voice');
  });

  it('English stays on the device voice, with no server call', async () => {
    await speak('What is your date of birth?', 'en-IN');
    expect(ttsRequests).toEqual([]);
    expect(deviceSpoken[0].voice).toBe('Rishi');
  });

  it('a mixed read-back speaks the Hindi half on the server and the English half on the device', async () => {
    await speakForUtterance('नाम प्रिया शर्मा। Please confirm this read-back.', 'mixed');
    expect(played).toHaveLength(1);
    expect(deviceSpoken.map((line) => line.text)).toEqual(['Please confirm this read-back.']);
  });

  it('a stop while the line is being fetched cancels it', async () => {
    const pending = speak('नमस्ते', 'hi-IN');
    stopSpeaking();
    await pending;
    expect(played).toEqual([]);
    expect(deviceSpoken).toEqual([]);
  });

  const READBACK =
    'कृपया इस रीड-बैक की पुष्टि करें। नाम: Priya Sharma। जन्म तिथि: 12 मार्च 1994। मोबाइल नंबर जिसके अंत में 3210 है। ' +
    'पहचान का प्रमाण: पैन कार्ड। उत्पाद: बचत खाता। यह केवल एक ड्राफ्ट है। Fields vary by bank. बैंक को कुछ भी जमा नहीं किया गया है।';

  it('splits a long line at sentence ends, with a short first piece, and keeps a short line whole', () => {
    const chunks = speechChunks(READBACK);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toBe(READBACK);
    expect(chunks[0]).toBe('कृपया इस रीड-बैक की पुष्टि करें। नाम: Priya Sharma।');
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(160);
    expect(speechChunks('आपकी जन्म तिथि क्या है? जैसे 12 मार्च 1994।')).toHaveLength(1);
  });

  it('a long read-back plays piece by piece, in order, starting and ending once', async () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();
    await speak(READBACK, 'hi-IN', { onStart, onEnd });
    const chunks = speechChunks(READBACK);
    expect(ttsRequests.map((url) => url.split('&text=')[1])).toEqual(chunks);
    expect(played).toHaveLength(chunks.length);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('is still speaking between pieces, and a stop ends the rest', async () => {
    holdAudio = true;
    const pending = speak(READBACK, 'hi-IN');
    await vi.waitFor(() => expect(played).toHaveLength(1));
    expect(isSpeaking()).toBe(true);
    stopSpeaking();
    await pending;
    expect(played).toHaveLength(1);
    expect(isSpeaking()).toBe(false);
  });

  it('reports speaking while server audio plays, and a stop ends it', async () => {
    holdAudio = true;
    const pending = speak('नमस्ते', 'hi-IN');
    await vi.waitFor(() => expect(isSpeaking()).toBe(true));
    stopSpeaking();
    await pending;
    expect(isSpeaking()).toBe(false);
  });
});

describe('read-back voice plan', () => {
  it('Hindi is spoken in Hindi, with the device Hindi voice as the backup', async () => {
    const plan = await resolveReadbackVoice('hi-IN');
    expect(plan.fellBackToEnglish).toBe(false);
    expect(plan.speech?.lang).toBe('hi-IN');
    expect(plan.speech?.voice?.name).toBe('Lekha');
  });

  it('a device with no Hindi voice still gets a Hindi read-back from the server voice', async () => {
    installSpeech([voice('Samantha', 'en-US', true)]);
    const plan = await resolveReadbackVoice('hi-IN');
    expect(plan.fellBackToEnglish).toBe(false);
    expect(plan.speech).toEqual({ lang: 'hi-IN' });
  });
});
