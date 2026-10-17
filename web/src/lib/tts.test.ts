import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveReadbackVoice } from './languages';
import { speak, speakForUtterance, stopSpeaking } from './tts';

const voice = (name: string, lang: string, isDefault = false) =>
  ({ name, lang, default: isDefault, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

/** This Mac's Chrome: default voice is English (India), Hindi is installed but not default. */
const MAC_VOICES = [voice('Rishi', 'en-IN', true), voice('Lekha', 'hi-IN'), voice('Geeta', 'te-IN')];

let spoken: Array<{ text: string; lang: string; voice: string | null }> = [];

function installSpeech(voices: SpeechSynthesisVoice[]) {
  spoken = [];
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
    addEventListener: () => {},
    removeEventListener: () => {},
    speak: (u: Utterance) => {
      spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name ?? null });
      u.onend?.();
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('speak picks a voice for the language', () => {
  it('reads Hindi with the Hindi voice, not the default English one', async () => {
    installSpeech(MAC_VOICES);
    await speak('आपकी जन्म तिथि क्या है? जैसे 12 मार्च 1994।', 'hi-IN');
    expect(spoken).toEqual([{ text: expect.any(String), lang: 'hi-IN', voice: 'Lekha' }]);
  });

  it('reads English with an English voice', async () => {
    installSpeech(MAC_VOICES);
    await speak('What is your date of birth?', 'en-IN');
    expect(spoken[0].voice).toBe('Rishi');
  });

  it('a mixed read-back speaks each half in its own voice', async () => {
    installSpeech(MAC_VOICES);
    await speakForUtterance('नाम प्रिया शर्मा। Please confirm this read-back.', 'mixed');
    expect(spoken.map((line) => line.voice)).toEqual(['Lekha', 'Rishi']);
  });

  it('a stop while the voice is being chosen cancels the line', async () => {
    installSpeech(MAC_VOICES);
    const pending = speak('नमस्ते', 'hi-IN');
    stopSpeaking();
    await pending;
    expect(spoken).toEqual([]);
  });
});

describe('read-back voice plan', () => {
  it('Hindi uses the Hindi voice when the device has one', async () => {
    installSpeech(MAC_VOICES);
    const plan = await resolveReadbackVoice('hi-IN');
    expect(plan.fellBackToEnglish).toBe(false);
    expect(plan.speech?.voice.name).toBe('Lekha');
  });

  it('Hindi falls back to English on a device with no Hindi voice', async () => {
    installSpeech([voice('Samantha', 'en-US', true)]);
    expect((await resolveReadbackVoice('hi-IN')).fellBackToEnglish).toBe(true);
  });
});
