import { findVoice, loadVoices } from './languages';

/** Bumped by every new utterance and by stopSpeaking; a mixed read-back stops when it changes. */
let speechGeneration = 0;
/** Bumped only by stopSpeaking, so a line still choosing its voice never starts after a stop. */
let stopCount = 0;

export interface SpeakHooks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export function speak(
  text: string,
  lang: string = 'en-IN',
  hooks?: SpeakHooks,
  voice?: SpeechSynthesisVoice | null,
): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !text.trim()) {
      resolve();
      return;
    }
    // Choosing a voice can wait for Chrome's voice list; a stop during that wait cancels this line.
    const stops = stopCount;
    void pickVoice(voice, lang).then((chosen) => {
      if (stops !== stopCount) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = chosen?.lang || lang;
      if (chosen) u.voice = chosen;
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
    });
  });
}

/**
 * The voice to use: the caller's, else the device voice for `lang`. Chrome on a desktop
 * ignores u.lang when u.voice is unset and reads Hindi with its default English voice,
 * which says only the digits, so a matching voice is always set when one exists.
 */
async function pickVoice(voice: SpeechSynthesisVoice | null | undefined, lang: string): Promise<SpeechSynthesisVoice | null> {
  if (voice) return voice;
  return findVoice(await loadVoices(), lang);
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
  stopCount++;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
