/** Bumped by every new utterance and by stopSpeaking; a mixed read-back stops when it changes. */
let speechGeneration = 0;

export interface SpeakHooks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

/** Chrome fills getVoices() asynchronously; wait briefly for the first voiceschanged. */
const VOICE_WAIT_MS = 600;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      synth.removeEventListener('voiceschanged', done);
      resolve(synth.getVoices());
    };
    const timer = window.setTimeout(done, VOICE_WAIT_MS);
    synth.addEventListener('voiceschanged', done);
  });
}

/**
 * Exact locale first (hi-IN), then any voice of the language (hi). Without an
 * explicit voice some browsers read Hindi text with the default English voice.
 */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  lang: 'en-IN' | 'hi-IN',
): SpeechSynthesisVoice | null {
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();
  const want = lang.toLowerCase();
  const base = want.split('-')[0];
  const exact = voices.filter((v) => norm(v) === want);
  const family = exact.length ? exact : voices.filter((v) => norm(v).split('-')[0] === base);
  return family.find((v) => v.default) ?? family[0] ?? null;
}

export function speak(
  text: string,
  lang: 'en-IN' | 'hi-IN' = 'en-IN',
  hooks?: SpeakHooks,
): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !text.trim()) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const generation = speechGeneration;
    void loadVoices().then((voices) => {
      if (generation !== speechGeneration) {
        resolve();
        return;
      }
      speakWithVoice(text, lang, pickVoice(voices, lang), hooks, resolve);
    });
  });
}

function speakWithVoice(
  text: string,
  lang: 'en-IN' | 'hi-IN',
  voice: SpeechSynthesisVoice | null,
  hooks: SpeakHooks | undefined,
  resolve: () => void,
): void {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  if (voice) u.voice = voice;
  u.rate = 0.95;
  u.onstart = () => hooks?.onStart?.();
  u.onend = () => {
    hooks?.onEnd?.();
    resolve();
  };
  u.onerror = (event) => {
    hooks?.onError?.(String((event as SpeechSynthesisErrorEvent).error ?? 'unknown'));
    resolve();
  };
  window.speechSynthesis.speak(u);
}

/** English stays en-IN. Hindi uses hi-IN. Mixed speaks Hindi, then English. */
export async function speakForUtterance(
  text: string,
  lang: 'en' | 'hi' | 'mixed',
  hooks?: SpeakHooks,
): Promise<void> {
  const generation = ++speechGeneration;
  if (lang !== 'mixed') {
    await speak(text, lang === 'hi' ? 'hi-IN' : 'en-IN', hooks);
    return;
  }
  const marker = 'Please confirm this read-back.';
  const splitAt = text.indexOf(marker);
  if (splitAt <= 0) {
    await speak(text, 'hi-IN', hooks);
    return;
  }
  await speak(text.slice(0, splitAt).trim(), 'hi-IN', hooks);
  if (generation !== speechGeneration) return;
  await speak(text.slice(splitAt).trim(), 'en-IN', hooks);
}

/** Cancels the current clip and any queued clips of a multi-part utterance. */
export function stopSpeaking(): void {
  speechGeneration++;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
